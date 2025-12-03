import { ILightConeData } from '@/app/types';

export const onTheFallOfAnAeon: ILightConeData = {
  id: 'on-the-fall-of-an-aeon',
  name: 'とある星神の殞落を記す',
  path: 'Destruction',
  baseStats: {
    hp: 1058,
    atk: 529,
    def: 396,
  },
  effects: [
    {
      id: 'atk_percent_on_attack_stacking',
      name: '火に飛び込む (攻撃力)',
      category: 'BUFF',
      sourceUnitId: '',
      durationType: 'PERMANENT',
      duration: -1,
      effectValue: [0.08, 0.1, 0.12, 0.14, 0.16],
      customHandler: true,
      apply: (unit, gameState, event) => {
        if (!event) return gameState;
        if (event.sourceId !== unit.id) return gameState;

        // Check if action is an attack (has damage)
        let isAttack = false;
        if (event.type === 'ON_BASIC_ATTACK') isAttack = !!unit.abilities.basic.damage;
        else if (event.type === 'ON_SKILL_USED') isAttack = !!unit.abilities.skill.damage;
        else if (event.type === 'ON_ULTIMATE_USED') isAttack = !!unit.abilities.ultimate.damage;

        if (!isAttack) return gameState;

        const superimposition = unit.equippedLightCone?.superimposition || 1;
        const atkValuePerStack = [0.08, 0.1, 0.12, 0.14, 0.16][superimposition - 1];
        const effectId = 'lc-aeon-atk-stacks';
        const modifierId = 'lc-aeon-atk';

        const unitIndex = gameState.units.findIndex(u => u.id === unit.id);
        if (unitIndex === -1) return gameState;

        const newUnits = [...gameState.units];
        const updatedUnit = { ...newUnits[unitIndex] };

        // Manage Effect for Stacks
        const existingEffectIndex = updatedUnit.effects.findIndex(e => e.id === effectId);
        let stackCount = 0;

        if (existingEffectIndex !== -1) {
          stackCount = updatedUnit.effects[existingEffectIndex].stackCount || 0;
          if (stackCount < 4) {
            stackCount++;
            updatedUnit.effects[existingEffectIndex] = {
              ...updatedUnit.effects[existingEffectIndex],
              stackCount: stackCount
            };
          }
        } else {
          stackCount = 1;
          updatedUnit.effects.push({
            id: effectId,
            name: '火に飛び込む (攻撃力)',
            category: 'BUFF',
            sourceUnitId: unit.id,
            durationType: 'PERMANENT',
            duration: -1,
            stackCount: 1,
            maxStacks: 4,
            apply: (t, s) => s,
            remove: (t, s) => s
          });
        }

        // Manage Modifier for Stats
        const existingModifierIndex = updatedUnit.modifiers.findIndex(m => m.source === modifierId);
        if (existingModifierIndex !== -1) {
          updatedUnit.modifiers[existingModifierIndex] = {
            ...updatedUnit.modifiers[existingModifierIndex],
            value: atkValuePerStack * stackCount
          };
        } else {
          updatedUnit.modifiers.push({
            source: modifierId,
            target: 'atk_pct',
            value: atkValuePerStack,
            type: 'pct'
          });
        }

        newUnits[unitIndex] = updatedUnit;

        if (stackCount <= 4) {
          gameState.log.push({
            actionType: 'Buff',
            sourceId: unit.id,
            targetId: unit.id,
            details: `とある星神の殞落を記す発動: 攻撃力 +${(atkValuePerStack * stackCount * 100).toFixed(1)}% (${stackCount} 層)`
          });
        }

        return { ...gameState, units: newUnits };
      },
      remove: (unit, gameState) => { return gameState; },
    },
    {
      id: 'dmg_percent_on_weakness_break',
      name: '火に飛び込む (与ダメージ)',
      category: 'BUFF',
      sourceUnitId: '',
      durationType: 'DURATION_BASED',
      duration: 2,
      effectValue: [0.12, 0.15, 0.18, 0.21, 0.24],
      customHandler: true,
      apply: (unit, gameState, event) => {
        if (!event || event.type !== 'ON_WEAKNESS_BREAK' || event.sourceId !== unit.id) return gameState;

        const superimposition = unit.equippedLightCone?.superimposition || 1;
        const dmgValue = [0.12, 0.15, 0.18, 0.21, 0.24][superimposition - 1];
        const effectId = 'lc-aeon-dmg-buff';
        const modifierId = 'lc-aeon-dmg';

        const unitIndex = gameState.units.findIndex(u => u.id === unit.id);
        if (unitIndex === -1) return gameState;

        const newUnits = [...gameState.units];
        const updatedUnit = { ...newUnits[unitIndex] };

        // Manage Effect for Duration
        const existingEffectIndex = updatedUnit.effects.findIndex(e => e.id === effectId);
        if (existingEffectIndex !== -1) {
          updatedUnit.effects[existingEffectIndex] = {
            ...updatedUnit.effects[existingEffectIndex],
            duration: 2
          };
        } else {
          updatedUnit.effects.push({
            id: effectId,
            name: '火に飛び込む (与ダメ)',
            category: 'BUFF',
            sourceUnitId: unit.id,
            durationType: 'DURATION_BASED',
            duration: 2,
            apply: (t, s) => s,
            remove: (t, s) => {
              // Remove Modifier when effect expires
              const uIndex = s.units.findIndex(u => u.id === t.id);
              if (uIndex === -1) return s;
              const u = { ...s.units[uIndex] };
              u.modifiers = u.modifiers.filter(m => m.source !== modifierId);
              const ns = { ...s };
              ns.units = [...ns.units];
              ns.units[uIndex] = u;
              return ns;
            }
          });
        }

        // Manage Modifier
        const existingModifierIndex = updatedUnit.modifiers.findIndex(m => m.source === modifierId);
        if (existingModifierIndex === -1) {
          updatedUnit.modifiers.push({
            source: modifierId,
            target: 'all_type_dmg_boost', // Correct stat key for DMG Boost
            value: dmgValue,
            type: 'pct'
          });
        }

        newUnits[unitIndex] = updatedUnit;

        gameState.log.push({
          actionType: 'Buff',
          sourceId: unit.id,
          targetId: unit.id,
          details: `とある星神の殞落を記す発動: 与ダメージ +${(dmgValue * 100).toFixed(1)}%`
        });

        return { ...gameState, units: newUnits };
      },
      remove: (unit, gameState) => { return gameState; },
    },
  ],
};
