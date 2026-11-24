/* Runs abandoned before finalization forfeit the reward.
 * Endless supplies the finalized result and restored character. The SaveGame
 * destination exposes read() and deliver(mutator), which commits a copy atomically.
 */
(function (root) {
  'use strict';

  const CC = root.CC = root.CC || {};
  const BEST_KEY = 'emberdeep-endless-v1';
  const PACK_LIMIT = 40; // Matches campaign pickup capacity.
  const rewardTiers = [
    { name: 'Scrap',    minProgress: 0,  minima: [0],          ceiling: 0, gold: 15, luck: 0 },
    { name: 'Bronze',   minProgress: 3,  minima: [0],          ceiling: 2, gold: 35, luck: 5 },
    { name: 'Silver',   minProgress: 6,  minima: [1, 1],       ceiling: 3, gold: 65, luck: 10, potions: 1, manaPotions: 1 },
    { name: 'Gold',     minProgress: 10, minima: [2, 1],       gold: 110, luck: 15, charm: true },
    { name: 'Platinum', minProgress: 15, minima: [3, 2, 2],    gold: 160, luck: 20, respecTokens: 1 },
    { name: 'Legendary', minProgress: 22, minima: [4, 2, 2],   gold: 230, luck: 25, legendaryChance: 0.30 },
    { name: 'Mythic',   minProgress: 30, minima: [4, 4, 3, 3], gold: 320, luck: 30, title: 'Beyond the Endless' }
  ];
  const stings = ['item_pickup_gen', 'item_pickup_gen', 'special_item', 'special_item', 'awesome_legendary'];
  const stingRates = [0.9, 1.15, 1, 1.2, 1];
  const finalReasons = new Set(['death', 'retire', 'disconnect']);
  const bestRecorded = new Map();
  const ceremonies = new Map();

  function nonnegative(value) {
    return Number.isFinite(value) ? Math.max(0, value) : 0;
  }

  function progress(result) {
    if (result.mode === 'plains') return nonnegative(result.elapsedSeconds) / 60;
    if (result.mode === 'catacombs') return 2 * Math.floor(nonnegative(result.floor));
    throw new RangeError('Unknown Endless mode');
  }

  function tierFor(value) {
    const tiers = CC.Endless?.TUNING?.rewardTiers || rewardTiers;
    let index = tiers.length - 1;
    while (index > 0 && value < tiers[index].minProgress) index--;
    return { ...tiers[index], index };
  }

  function rollReward(result, character) {
    const value = progress(result);
    const tier = tierFor(value);
    const floor = Math.min(14, 2 + value * 0.55);
    const luck = nonnegative(character.luck) + tier.luck;
    const level = Math.max(1, Math.floor(nonnegative(character.level)));
    const items = tier.minima.map((minimum) => {
      if (tier.legendaryChance && minimum < 4 && Math.random() < tier.legendaryChance) minimum = 4;
      const item = CC.Loot.rollItem(floor, luck, minimum, character.classId, 'normal', level);
      // Loot has a minimum but no maximum, and character level can open its depth gates early.
      if (item.rarity > tier.ceiling) {
        return CC.Loot.makeItem(floor, tier.ceiling, item.slot, character.classId, level);
      }
      return item;
    });
    const bonuses = { gold: tier.gold };
    if (tier.potions) {
      bonuses.potions = tier.potions;
      bonuses.manaPotions = tier.manaPotions;
    }
    if (tier.respecTokens) bonuses.respecTokens = tier.respecTokens;
    if (tier.title) bonuses.title = tier.title;
    return {
      progress: value, tier, items, bonuses,
      charm: tier.charm ? CC.Loot.rollCharm(floor, luck, 'normal', level) : null
    };
  }

  function personalBests() {
    let saved;
    try {
      saved = JSON.parse(root.localStorage.getItem(BEST_KEY));
    } catch {
      // Missing, unavailable or damaged storage starts with empty records.
    }
    function modeBest(mode, depth) {
      const entry = saved?.[mode];
      return {
        bestSeconds: nonnegative(entry?.bestSeconds),
        [depth]: nonnegative(entry?.[depth]),
        kills: nonnegative(entry?.kills),
        runs: nonnegative(entry?.runs)
      };
    }
    return {
      plains: modeBest('plains', 'bestLevel'),
      catacombs: modeBest('catacombs', 'bestFloor')
    };
  }

  function recordBest(result) {
    if (bestRecorded.has(result.id)) return bestRecorded.get(result.id);
    const records = personalBests();
    const record = records[result.mode];
    const seconds = nonnegative(result.elapsedSeconds);
    const isPlains = result.mode === 'plains';
    const key = isPlains ? 'bestLevel' : 'bestFloor';
    const depth = nonnegative(isPlains ? result.level ?? Math.floor(seconds / 300) : result.floor);
    const best = { time: seconds > record.bestSeconds, depth: depth > record[key], saved: false };
    record.bestSeconds = Math.max(record.bestSeconds, seconds);
    record[key] = Math.max(record[key], depth);
    record.kills += nonnegative(result.kills);
    record.runs++;
    try {
      root.localStorage.setItem(BEST_KEY, JSON.stringify(records));
      best.saved = true;
    } catch {
      // The ceremony can still proceed if the browser cannot save statistics.
    }
    bestRecorded.set(result.id, best);
    return best;
  }

  function best(mode) {
    const record = personalBests()[mode];
    return record?.runs > 0 ? record : null;
  }

  function finalize(result, destination) {
    if (!finalReasons.has(result.reason)) return null;
    const { character } = result;
    if (result.id == null || character?.id == null || !character.classId ||
        typeof destination?.deliver !== 'function' || typeof destination?.read !== 'function') {
      throw new TypeError('Endless rewards require a run ID, restored character and reward destination');
    }
    const key = JSON.stringify([result.id, character.id]);
    if (ceremonies.has(key)) return ceremonies.get(key);
    const reward = rollReward(result, character);
    const ceremony = createCeremony(reward, destination, recordBest(result));
    ceremonies.set(key, ceremony);
    return ceremony;
  }

  function createCeremony(reward, destination, record) {
    const chests = reward.charm ? [...reward.items, reward.charm] : reward.items.slice();
    const bonuses = Object.freeze(reward.bonuses);
    let index = 0;
    let opened = false;
    let packFull = false;
    let busy = false;
    let bonusesApplied = false;
    let flashUntil = 0;
    let message = '';
    let swapIndex = 0;

    function deliver(mutator) {
      if (busy) return false;
      busy = true;
      try {
        const result = destination.deliver(mutator);
        if (result.ok) {
          message = '';
          return true;
        }
        message = result.reason === 'no-empty-slot'
          ? 'A free character slot is needed to save this reward.'
          : 'Could not save the reward. Try again.';
        return false;
      } finally {
        busy = false;
      }
    }

    const ceremony = {
      tier: reward.tier,
      progress: reward.progress,
      record,
      personalBest: record.saved && (record.time || record.depth),
      bonuses,
      get current() {
        const item = chests[index];
        if (!item) return null;
        return {
          number: index + 1, total: chests.length, rarity: CC.Loot.RARITIES[item.rarity],
          opened, packFull, item: opened ? item : null
        };
      },
      get pending() {
        return !bonusesApplied;
      },
      reveal() {
        if (busy || opened || index >= chests.length) return false;
        opened = true;
        const { rarity } = chests[index];
        if (rarity === 4 && !root.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
          flashUntil = Date.now() + 300;
        }
        CC.Audio?.play?.(stings[rarity], { rate: stingRates[rarity] });
        return true;
      },
      swapOptions() {
        return packFull ? destination.read()?.inventory || [] : [];
      },
      choose(action, replacementIndex) {
        if (!opened || busy) return false;
        if (action !== 'inventory' && !(packFull && ['stash', 'sell', 'swap'].includes(action))) return false;
        const item = chests[index];
        let full = false;
        const delivered = deliver((data) => {
          const pack = data.inventory ||= [];
          if (action === 'inventory') {
            full = pack.length >= PACK_LIMIT;
            if (full) return false;
            pack.push(item);
          } else if (action === 'sell') {
            data.gold = nonnegative(data.gold) + nonnegative(item.value);
          } else {
            const stash = data.player.endlessStash ||= [];
            if (action === 'swap') {
              if (!Number.isInteger(replacementIndex) || !pack[replacementIndex]) return false;
              stash.push(...pack.splice(replacementIndex, 1, item));
            } else {
              stash.push(item);
            }
          }
          return true;
        });
        if (!delivered) {
          if (full) {
            packFull = true;
            message = 'Inventory full. Choose what to do with this item.';
          }
          return false;
        }
        index++;
        opened = false;
        packFull = false;
        swapIndex = 0;
        flashUntil = 0;
        return true;
      },
      claimBonuses() {
        if (index !== chests.length || bonusesApplied) return false;
        const delivered = deliver((data) => {
          for (const key of ['gold', 'potions', 'manaPotions']) {
            if (bonuses[key]) data[key] = nonnegative(data[key]) + bonuses[key];
          }
          if (bonuses.respecTokens) {
            data.player.endlessRespecTokens = nonnegative(data.player.endlessRespecTokens) + bonuses.respecTokens;
          }
          if (bonuses.title) {
            const titles = data.player.endlessTitles ||= [];
            if (!titles.includes(bonuses.title)) titles.push(bonuses.title);
          }
          return true;
        });
        if (delivered) bonusesApplied = true;
        return delivered;
      },
      draw(ctx, W, H, button) {
        if (!this.pending) return false;
        const y = Math.max(30, H / 2 - 135) + 140;
        const width = Math.min(450, W - 16);
        const left = (W - width) / 2;
        const current = this.current;
        const choiceWidth = (width - 8) / 3;
        const show = (label, row, color = '#ede5f4', size = 13) => {
          ctx.font = size + 'px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillStyle = color;
          ctx.fillText(label, W / 2, y + row, width);
        };
        ctx.save();
        if (!current) {
          const labels = [bonuses.gold + ' Gold'];
          if (bonuses.potions) labels.push('Health and Mana Potions');
          if (bonuses.respecTokens) labels.push('Skill Respec Token');
          if (bonuses.title) labels.push(bonuses.title);
          show(labels.join(' · '), 18, '#ffe3a2');
          button(left, y + 30, width, 32, 'Collect Bonuses', '#725432', () => this.claimBonuses());
        } else {
          const color = current.rarity.color;
          const label = current.rarity.name + ' Chest ' + current.number + '/' + current.total;
          const flash = Math.max(0, (flashUntil - Date.now()) / 300);
          ctx.shadowColor = flash > 0 ? '#fff' : color;
          ctx.shadowBlur = 10 + 20 * flash;
          show(this.tier.name + ' Rewards · ' + label, 12, flash > 0 ? '#fff' : color);
          ctx.shadowBlur = 0;
          if (!current.opened) {
            button(left, y + 25, width, 34, 'Open Chest', '#51366b', () => this.reveal());
          } else {
            const item = current.item;
            show(item.name, 31, color, 15);
            const stats = Object.entries(item.stats).map(([key, value]) =>
              (value > 0 ? '+' : '') + value + ' ' + (CC.Loot.LABEL[key] || key)).join(' · ');
            show(stats, 47);
            if (current.packFull) {
              const options = this.swapOptions();
              const replacement = options[swapIndex];
              button(left, y + 54, choiceWidth, 28, 'Stash', '#4a3a6a', () => this.choose('stash'));
              button(left + choiceWidth + 4, y + 54, choiceWidth, 28, 'Sell · ' + item.value + 'g', '#725432', () => this.choose('sell'));
              if (replacement) {
                button(left + 2 * (choiceWidth + 4), y + 54, choiceWidth, 28, 'Swap to Stash', '#51366b', () => this.choose('swap', swapIndex));
                button(left, y + 85, width, 28, 'Swap target · ' + replacement.name + ' ›', '#352646',
                  () => { swapIndex = (swapIndex + 1) % options.length; });
              }
            } else {
              if (item.effect?.desc) show(item.effect.desc, 64);
              button(left, y + 72, width, 32, 'Take Item', '#725432', () => this.choose('inventory'));
            }
          }
        }
        if (message) show(message, current?.packFull ? 130 : 120, '#ffe3a2');
        ctx.restore();
        return true;
      }
    };
    return ceremony;
  }

  if (CC.Endless?.TUNING) CC.Endless.TUNING.rewardTiers = rewardTiers;
  CC.EndlessRewards = { rewardTiers, progress, tierFor, rollReward, personalBests, best, finalize };
})(window);
