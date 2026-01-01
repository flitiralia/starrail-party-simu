import { GameState, IEvent, IEventHandler, IEventHandlerLogic, IEventHandlerFactory, Unit } from '../types';
import { Element } from '../../../types';
import { createUnitId } from '../unitId';

/**
 * 天才の閃光 (Genius of Brilliant Stars) 4セット効果ハンドラ。
 * 敵の防御力を無視する効果を、ダメージ計算イベント時に適用します。
 */

// IEventHandlerLogic の定義
export const handleGeniusOfBrilliantStarsLogic: IEventHandlerLogic = (event, state, handlerId) => {
    if (event.type !== 'ON_BEFORE_DAMAGE_CALCULATION') {
        return state;
    }

    // イベントソースがキャラクターであり、かつそのキャラクターの属性が「量子」である場合にのみ発動
    const sourceUnit = state.registry.get(createUnitId(event.sourceId));
    if (!sourceUnit || sourceUnit.element !== 'Quantum') {
        return state;
    }

    if (!event.targetId) {
        return state;
    }

    const targetUnit = state.registry.get(createUnitId(event.targetId));
    if (!targetUnit) {
        return state;
    }
    if (!targetUnit) {
        return state;
    }

    const isWeakToQuantum = targetUnit.weaknesses.has('Quantum');
    let defIgnore = 0.1; // 量子弱点の敵に攻撃するとき、防御を10%無視。

    if (isWeakToQuantum) {
        // 量子弱点がある場合: 10%
        defIgnore = 0.1;
    } else {
        // 量子弱点がない場合: 10% + 追加10% = 20%
        defIgnore = 0.2;
    }

    // GameState の damageModifiers に防御無視率を一時的に設定
    // 複数の効果が defIgnore を提供する場合、最大値ではなく加算されるように設計すべきだが、
    // ここでは簡単のため、加算として実装する (0.1 + 0.2 = 0.3)
    const newDefIgnore = (state.damageModifiers.defIgnore || 0) + defIgnore;

    return {
        ...state,
        damageModifiers: {
            ...state.damageModifiers,
            defIgnore: newDefIgnore,
        }
    };
};

// IEventHandlerFactory の定義
// level パラメータは遺物ではピース数 (2または4) を表す
export const createGeniusOfBrilliantStarsFactory: IEventHandlerFactory = (sourceUnitId, pieces, superimposition) => {
    // 2セット効果は statBuilder で静的に適用済みと仮定
    if (pieces < 4) {
        // 4セット効果の発動条件を満たさない場合は、動的ハンドラは登録しない
        return {
            handlerMetadata: { id: `genius-${pieces}pc-${sourceUnitId}`, subscribesTo: [] },
            handlerLogic: handleGeniusOfBrilliantStarsLogic,
        };
    }

    const handlerMetadata: IEventHandler = {
        id: `genius-4pc-${sourceUnitId}`,
        subscribesTo: ['ON_BEFORE_DAMAGE_CALCULATION'], // ダメージ計算前に介入
    };

    return {
        handlerMetadata,
        handlerLogic: handleGeniusOfBrilliantStarsLogic,
    };
};
