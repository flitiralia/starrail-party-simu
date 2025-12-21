import { ILightConeData } from '@/app/types';
import { addEffect } from '@/app/simulator/engine/effectManager';

export const theMolesWelcomeYou: ILightConeData = {
    id: 'the-moles-welcome-you',
    name: 'モグラ党へようこそ',
    description: '装備キャラが通常攻撃、戦闘スキル、または必殺技で敵に攻撃を行った後、それぞれ「わんぱく値」を1層まで獲得できる。1層につき、装備キャラの攻撃力+12%。',
    descriptionTemplate: '装備キャラが通常攻撃、戦闘スキル、または必殺技で敵に攻撃を行った後、それぞれ「わんぱく値」を1層まで獲得できる。1層につき、装備キャラの攻撃力+{0}%。',
    descriptionValues: [
        ['12'],
        ['15'],
        ['18'],
        ['21'],
        ['24']
    ],
    path: 'Destruction',
    baseStats: {
        hp: 1058,
        atk: 476,
        def: 264,
    },
    eventHandlers: [
        {
            id: 'moles_stack_gain',
            name: 'わんぱく値獲得',
            events: ['ON_BASIC_ATTACK', 'ON_SKILL_USED', 'ON_ULTIMATE_USED'],
            handler: (event, state, unit, superimposition) => {
                if (event.sourceId !== unit.id) return state;

                const atkVal = [0.12, 0.15, 0.18, 0.21, 0.24][superimposition - 1];

                // タイプを決定
                let type: 'basic' | 'skill' | 'ult' | null = null;
                if (event.type === 'ON_BASIC_ATTACK') type = 'basic';
                if (event.type === 'ON_SKILL_USED') type = 'skill';
                if (event.type === 'ON_ULTIMATE_USED') type = 'ult';

                if (!type) return state;

                const buffId = `moles_buff_${type}_${unit.id}`;

                // すでにこの特定のバフを持っているか確認
                const hasBuff = unit.effects.some(e => e.id === buffId);
                if (hasBuff) return state;

                return addEffect(state, unit.id, {
                    id: buffId,
                    name: `わんぱく値（${type}）`,
                    category: 'BUFF',
                    sourceUnitId: unit.id,
                    durationType: 'PERMANENT',
                    duration: -1, // 永続にはdurationが必要？ 型定義では number | '∞'。
                    // 999 または扱えるなら '∞' を使用する。
                    // 以前のファイルでは durationType: 'PERMANENT' を使用したが duration を忘れていた。
                    // Typingsを満たすために1か-1を設定するが、'PERMANENT' は通常これを無視する。
                    // ここでは1を提供する。
                    modifiers: [
                        {
                            target: 'atk_pct',
                            source: 'モグラ党へようこそ',
                            type: 'add',
                            value: atkVal
                        }
                    ],
                    apply: (u, s) => s,
                    remove: (u, s) => s
                });
            }
        }
    ]
};
