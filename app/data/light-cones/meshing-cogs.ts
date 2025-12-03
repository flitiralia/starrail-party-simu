import { ILightConeData } from '@/app/types';

export const meshingCogs: ILightConeData = {
  id: 'meshing-cogs',
  name: '輪契',
  path: 'Harmony',
  baseStats: {
    hp: 846,
    atk: 317,
    def: 264,
  },
  effects: [
    {
      id: 'ep_regen_on_attack_or_hit',
      name: '速決',
      category: 'BUFF',
      sourceUnitId: '',
      durationType: 'PERMANENT',
      duration: -1,
      effectValue: [4, 5, 6, 7, 8],
      customHandler: true,
      apply: (unit, gameState, event) => {
        if (!event || event.type !== 'ON_DAMAGE_DEALT') return gameState;

        const isAttacker = event.sourceId === unit.id;
        const isHit = event.targetId === unit.id;

        if (!isAttacker && !isHit) return gameState;

        const handlerId = `lc-meshing-cogs-${unit.id}`;
        if (gameState.cooldowns[handlerId] > 0) return gameState;

        const superimposition = unit.equippedLightCone?.superimposition || 1;
        const energyValue = [4, 5, 6, 7, 8][superimposition - 1];

        // Apply Energy
        // We need to find the unit in the new state to update it
        const unitIndex = gameState.units.findIndex(u => u.id === unit.id);
        if (unitIndex === -1) return gameState;

        const newUnits = [...gameState.units];
        const updatedUnit = { ...newUnits[unitIndex] };
        updatedUnit.ep = Math.min(updatedUnit.stats.max_ep, updatedUnit.ep + energyValue);
        newUnits[unitIndex] = updatedUnit;

        // Set Cooldown
        const newCooldowns = { ...gameState.cooldowns, [handlerId]: 1 };

        gameState.log.push({
          actionType: 'EnergyRestore',
          sourceId: unit.id,
          targetId: unit.id,
          details: `輪契発動: EP +${energyValue}`
        });

        return {
          ...gameState,
          units: newUnits,
          cooldowns: newCooldowns
        };
      },
      remove: (unit, gameState) => { return gameState; },
    },
  ],
};
