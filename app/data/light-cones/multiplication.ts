import { ILightConeData } from '../../types';

export const multiplication: ILightConeData = {
    id: 'multiplication',
    name: '蕃殖',
    description: '装備キャラが通常攻撃を行った後、次の行動順が12%早まる。',
    descriptionTemplate: '装備キャラが通常攻撃を行った後、次の行動順が{0}%早まる。',
    descriptionValues: [
        ['12'],
        ['14'],
        ['16'],
        ['18'],
        ['20']
    ],
    path: 'Abundance',
    baseStats: {
        hp: 952,
        atk: 317,
        def: 198,
    },

    eventHandlers: [
        {
            id: 'multiplication-advance',
            name: '豊穣の民（行動順短縮）',
            events: ['ON_BASIC_ATTACK'],
            handler: (event, state, unit, superimposition) => {
                if (event.sourceId !== unit.id) return state;

                const advance = [0.12, 0.14, 0.16, 0.18, 0.20][superimposition - 1];

                // 行動順短縮をトリガー
                // ActionQueue/Action Logicを使用？
                // 通常、ACTION_ADVANCE アクションをプッシュするか、AVを直接変更することで行動順短縮をシミュレートする？
                // "次の行動順が...早まる"。
                // 現在のアクションが終了すると、AVはリセットされる。
                // *今*短縮すると、*次の*ターンのAVが減少する。
                // `advanceAction` ヘルパー？
                // シミュレータは `ACTION_ADVANCE` アクションタイプをサポートしている。
                // エンキューできるか？それとも状態を直接変更するか？
                // `pendingActions` に `ActionAdvanceAction` を提供する？

                return {
                    ...state,
                    pendingActions: [
                        ...state.pendingActions,
                        {
                            type: 'ACTION_ADVANCE',
                            targetId: unit.id,
                            percent: advance
                        }
                    ]
                };
            }
        }
    ]
};
