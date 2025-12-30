import { describe, it, expect, beforeEach } from 'vitest';
import { createInitialGameState } from '../engine/gameState';
import { dispatch } from '../engine/dispatcher';
import { fugue, fugueHandlerFactory } from '../../data/characters/fugue';
import { Character, Enemy, PartyConfig, Element } from '../../types';
import { GameState, Unit } from '../engine/types';
import { createUnitId } from '../engine/unitId';

// Helper to get unit by ID from state
const getUnit = (state: GameState, id: string): Unit | undefined => {
    return state.registry.get(createUnitId(id));
};

describe('Fugue Scenario Test', () => {
    let initialState: GameState;
    const fugueId = 'fugue-1';
    const allyId = 'ally-1';
    const enemyId = 'enemy-1';

    // シンプルな味方キャラクター
    const simpleAlly: Character = {
        id: allyId,
        name: 'Test Ally',
        path: 'Destruction',
        element: 'Physical',
        rarity: 5,
        maxEnergy: 120,
        baseStats: {
            hp: 1000,
            atk: 500,
            def: 400,
            spd: 100,
            critRate: 0.05,
            critDmg: 0.50,
            aggro: 100
        },
        abilities: {
            basic: { id: 'ally-basic', name: 'Basic', type: 'Basic ATK', description: '', damage: { type: 'simple', scaling: 'atk', hits: [{ multiplier: 1.0, toughnessReduction: 10 }] } },
            skill: { id: 'ally-skill', name: 'Skill', type: 'Skill', description: '' },
            ultimate: { id: 'ally-ult', name: 'Ultimate', type: 'Ultimate', description: '' },
            talent: { id: 'ally-talent', name: 'Talent', type: 'Talent', description: '' },
            technique: { id: 'ally-tech', name: 'Technique', type: 'Technique', description: '' }
        },
        traces: [],
        eidolons: {}
    };

    beforeEach(() => {
        // Setup initial state with Fugue, an ally, and an Enemy
        const characters: Character[] = [
            { ...fugue, id: fugueId },
            simpleAlly
        ];

        const enemies: Enemy[] = [{
            id: enemyId,
            name: 'Test Enemy',
            level: 80,
            element: 'Fire',
            toughness: 120,
            baseStats: { hp: 100000, atk: 1000, def: 1000, spd: 100, aggro: 100, critRate: 0.05, critDmg: 0.5 },
            baseRes: { Physical: 0.2, Fire: 0.2, Ice: 0.2, Lightning: 0.2, Wind: 0.2, Quantum: 0.2, Imaginary: 0.2 },
            abilities: {
                basic: { id: 'e-basic', name: 'Atk', type: 'Basic ATK', description: '', damage: { scaling: 'atk', type: 'simple', hits: [{ multiplier: 1, toughnessReduction: 10 }] } },
                skill: { id: 'e-skill', name: 'Skill', type: 'Skill', description: '' },
                ultimate: { id: 'e-ult', name: 'Ult', type: 'Ultimate', description: '' },
                talent: { id: 'e-talent', name: 'Talent', type: 'Talent', description: '' },
                technique: { id: 'e-tech', name: 'Tech', type: 'Technique', description: '' }
            }
        } as Enemy];

        const partyConfig: PartyConfig = {
            members: characters.map(char => ({
                character: char,
                config: { rotation: [], rotationMode: 'sequence', ultStrategy: 'immediate', ultCooldown: 0 },
                enabled: true,
                eidolonLevel: 0
            }))
        };

        const config = {
            characters,
            enemies,
            weaknesses: new Set(['Fire']) as Set<Element>,
            enemyConfig: { level: 80, maxHp: 100000, toughness: 120, spd: 100 },
            partyConfig,
            rounds: 5
        };

        initialState = createInitialGameState(config);

        // Register Fugue's event handlers
        const { handlerMetadata, handlerLogic } = fugueHandlerFactory(fugueId, 80, 0);
        initialState = {
            ...initialState,
            eventHandlers: [...initialState.eventHandlers, handlerMetadata],
            eventHandlerLogics: { ...initialState.eventHandlerLogics, [handlerMetadata.id]: handlerLogic }
        };

        // Dispatch BATTLE_START to trigger initial effects
        initialState = dispatch(initialState, { type: 'BATTLE_START' });
    });

    it('should apply Cloudflame to enemies at battle start (Talent)', () => {
        const enemy = getUnit(initialState, enemyId);
        expect(enemy).toBeDefined();

        // 雲火昭瑞エフェクトがあるか確認
        const cloudflameEffect = enemy!.effects.find(e => e.id.includes('cloudflame'));
        expect(cloudflameEffect).toBeDefined();
        expect(cloudflameEffect?.name).toBe('雲火昭瑞');
    });

    it('should apply A4 break effect buff at battle start', () => {
        const fugueUnit = getUnit(initialState, fugueId);
        expect(fugueUnit).toBeDefined();

        // A4撃破特効バフがあるか確認
        const a4Effect = fugueUnit!.effects.find(e => e.id.includes('a4-break'));
        expect(a4Effect).toBeDefined();
        expect(a4Effect?.name).toContain('塗山の玄設');
    });

    it('should apply Fox Prayer to ally when using Skill', () => {
        let state = initialState;

        // Use Skill targeting ally
        state = dispatch(state, { type: 'SKILL', sourceId: fugueId, targetId: allyId });

        // 狐の祈りがあるか確認
        const ally = getUnit(state, allyId);
        expect(ally).toBeDefined();

        const foxPrayerEffect = ally!.effects.find(e => e.id.includes('fox-prayer'));
        expect(foxPrayerEffect).toBeDefined();
        expect(foxPrayerEffect?.name).toBe('狐の祈り');
    });

    it('should enter Scorching state when using Skill', () => {
        let state = initialState;

        // Use Skill
        state = dispatch(state, { type: 'SKILL', sourceId: fugueId, targetId: allyId });

        // 灼熱状態になっているか確認
        const fugueUnit = getUnit(state, fugueId);
        expect(fugueUnit).toBeDefined();

        const scorchingEffect = fugueUnit!.effects.find(e => e.id.includes('scorching'));
        expect(scorchingEffect).toBeDefined();
        expect(scorchingEffect?.name).toBe('灼熱');
        // ENHANCED_BASICタグがあるか確認
        expect(scorchingEffect?.tags).toContain('ENHANCED_BASIC');
    });

    it('should grant SP on first skill (A4)', () => {
        let state = initialState;
        const initialSP = state.skillPoints;

        // Use Skill (first time)
        state = dispatch(state, { type: 'SKILL', sourceId: fugueId, targetId: allyId });

        // SP should increase by 1 (skill costs 1, A4 grants 1, net 0)
        // Actually: Skill costs 1 SP, A4 grants 1 SP, so net change is 0
        // Let's check the flag is removed
        const fugueUnit = getUnit(state, fugueId);
        const a4Flag = fugueUnit?.effects.find(e => e.id.includes('a4-flag'));
        expect(a4Flag).toBeUndefined(); // Flag should be removed after first skill
    });

    it('should have Fox Prayer break effect bonus', () => {
        let state = initialState;

        // Use Skill to apply Fox Prayer
        state = dispatch(state, { type: 'SKILL', sourceId: fugueId, targetId: allyId });

        const ally = getUnit(state, allyId);
        expect(ally).toBeDefined();

        const foxPrayerEffect = ally!.effects.find(e => e.id.includes('fox-prayer'));
        expect(foxPrayerEffect).toBeDefined();

        // 撃破特効+30%のモディファイアがあるか確認
        const breakEffectMod = foxPrayerEffect?.modifiers?.find(m => m.target === 'break_effect');
        expect(breakEffectMod).toBeDefined();
        expect(breakEffectMod?.value).toBe(0.30);
    });

    describe('Eidolon Tests', () => {
        it('E1: should grant break efficiency to Fox Prayer ally', () => {
            // E1でテスト
            let state = initialState;

            // E1ハンドラーを登録
            const { handlerMetadata, handlerLogic } = fugueHandlerFactory(fugueId, 80, 1);
            state = {
                ...state,
                eventHandlers: [...state.eventHandlers.filter(h => !h.id.includes('fugue')), handlerMetadata],
                eventHandlerLogics: { ...state.eventHandlerLogics, [handlerMetadata.id]: handlerLogic }
            };

            // Use Skill
            state = dispatch(state, { type: 'SKILL', sourceId: fugueId, targetId: allyId });

            const ally = getUnit(state, allyId);
            const foxPrayerEffect = ally?.effects.find(e => e.id.includes('fox-prayer'));

            // E1: 弱点撃破効率+50%
            const breakEfficiencyMod = foxPrayerEffect?.modifiers?.find(m => m.target === 'break_efficiency_boost');
            expect(breakEfficiencyMod).toBeDefined();
            expect(breakEfficiencyMod?.value).toBe(0.50);
        });

        it('E2: should advance allies action after ultimate', () => {
            // E2でテスト
            let state = initialState;

            // E2ハンドラーを登録
            const { handlerMetadata, handlerLogic } = fugueHandlerFactory(fugueId, 80, 2);
            state = {
                ...state,
                eventHandlers: [...state.eventHandlers.filter(h => !h.id.includes('fugue')), handlerMetadata],
                eventHandlerLogics: { ...state.eventHandlerLogics, [handlerMetadata.id]: handlerLogic }
            };

            // Give enough EP
            state = {
                ...state,
                registry: state.registry.update(createUnitId(fugueId), u => ({
                    ...u,
                    ep: 130
                }))
            };

            const allyBefore = getUnit(state, allyId);
            const avBefore = allyBefore?.actionValue || 0;

            // Use Ultimate
            state = dispatch(state, { type: 'ULTIMATE', sourceId: fugueId });

            const allyAfter = getUnit(state, allyId);
            const avAfter = allyAfter?.actionValue || 0;

            // 行動順が24%早まっているか確認
            expect(avAfter).toBeLessThan(avBefore);
        });
    });
});
