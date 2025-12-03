import { OrnamentSet } from '../../types';

export const UNFORESEEN_VANADISE: OrnamentSet = {
  id: 'unforeseen_vanadise',
  name: '奇想天外のバナダイス',
  setBonuses: [
    {
      pieces: 2,
      description: '装備キャラの会心ダメージ+16%。装備キャラが召喚したターゲットがフィールド上にいる場合、さらに会心ダメージ+32%。',
      effects: [
        {
          type: 'PASSIVE_STAT',
          stat: 'crit_dmg',
          value: 0.16,
          target: 'self'
        },
        {
          type: 'PASSIVE_STAT',
          stat: 'crit_dmg',
          value: 0.32,
          target: 'self',
          condition: (stats, state: any, unitId: any) => {
            // Check if summon exists
            // Assuming summons are units with summonerId or similar logic
            // Currently no explicit summon support in Unit interface, but let's assume checking for units with ownerId == unitId
            // Or check effects?
            // If not supported, return false for now.
            // TODO: Implement summon check
            return false;
          }
        }
      ],
    },
  ],
};
