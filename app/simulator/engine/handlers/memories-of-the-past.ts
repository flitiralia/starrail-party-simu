import { GameState, IEvent, IEventHandler, IEventHandlerLogic, IEventHandlerFactory, Unit } from '../types';
import { addEnergyToUnit } from '../energy';
import { createUnitId } from '../unitId';
// 重畳ランク1-5に対応するEP回復量
const EP_RECOVERY_VALUES = [4, 5, 6, 7, 8];
const COOLDOWN_TURNS = 1;

/**
 * 記憶の内の姿 (Memories of the Past) イベントハンドラロジック。
 * 攻撃後にEPを回復し、クールダウンを設定します。
 */
export const handleMemoriesOfThePastLogic: IEventHandlerLogic = (event, state, handlerId) => {
    if (event.type !== 'ON_DAMAGE_DEALT') {
        return state;
    }

    // handlerIdから装備者IDと重畳ランクを取得 (例: memories-s5-charId)
    const parts = handlerId.split('-');
    const superimposition = parseInt(parts[1].replace('s', '')) as 1 | 2 | 3 | 4 | 5;
    const sourceUnitId = parts[2];

    // 装備者自身のアクションでない場合は無視
    if (event.sourceId !== sourceUnitId) {
        return state;
    }

    // クールダウンチェック
    if (state.cooldowns[handlerId] > 0) {
        return state;
    }

    const sourceUnit = state.registry.get(createUnitId(sourceUnitId));
    if (!sourceUnit) {
        return state;
    }

    // EP回復量を決定（ERR適用）
    const baseEp = EP_RECOVERY_VALUES[superimposition - 1];
    let newState = addEnergyToUnit(state, sourceUnitId, baseEp);

    // クールダウンを設定
    const newCooldowns = {
        ...newState.cooldowns,
        [handlerId]: COOLDOWN_TURNS,
    };

    // TODO: ログ記録を追加すべきだが、ここではロジックの動作検証を優先

    return {
        ...newState,
        cooldowns: newCooldowns,
    };
};

/**
 * 記憶の内の姿 光円錐のイベントハンドラファクトリ。
 */
export const createMemoriesOfThePastFactory: IEventHandlerFactory = (sourceUnitId, level, superimposition) => {
    if (!superimposition) {
        throw new Error("Superimposition required for Light Cone factory.");
    }

    const handlerMetadata: IEventHandler = {
        id: `memories-s${superimposition}-${sourceUnitId}`,
        subscribesTo: ['ON_DAMAGE_DEALT'],
    };

    return {
        handlerMetadata,
        handlerLogic: handleMemoriesOfThePastLogic,
    };
};
