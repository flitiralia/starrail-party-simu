import { ILightConeData } from '@/app/types';

export const danceDanceDance: ILightConeData = {
  id: 'dance-dance-dance',
  name: 'ダンス！ダンス！ダンス！',
  path: 'Harmony',
  baseStats: {
    hp: 952,
    atk: 423,
    def: 396,
  },
  effects: [
    {
      id: 'action_forward_on_ultimate',
      name: '止まらないよぉ！',
      category: 'BUFF',
      sourceUnitId: '',
      durationType: 'PERMANENT',
      duration: -1,
      effectValue: [0.16, 0.18, 0.2, 0.22, 0.24],
      customHandler: true,
      apply: (unit, gameState, event) => {
        if (!event || event.type !== 'ON_ULTIMATE_USED' || event.sourceId !== unit.id) {
          return gameState;
        }

        const superimposition = unit.equippedLightCone?.superimposition || 1;
        const advanceValue = [0.16, 0.18, 0.2, 0.22, 0.24][superimposition - 1];

        const allies = gameState.units.filter(u => !u.isEnemy && u.hp > 0);
        const newPendingActions = [...(gameState.pendingActions || [])];

        allies.forEach(ally => {
          newPendingActions.push({
            type: 'ACTION_ADVANCE',
            targetId: ally.id,
            percent: advanceValue
          } as any); // Cast to any to avoid import issues if types are not perfectly aligned in this file context
        });

        gameState.log.push({
          actionType: 'Buff',
          sourceId: unit.id,
          targetId: 'all_allies',
          details: `ダンス！ダンス！ダンス！発動: 行動順短縮 ${advanceValue * 100}%`
        });

        return {
          ...gameState,
          pendingActions: newPendingActions
        };
      },
      remove: (unit, gameState) => { return gameState; },
    },
  ],
};
