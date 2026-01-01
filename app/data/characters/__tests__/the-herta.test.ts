import { describe, it, expect, beforeEach } from 'vitest';
import { dispatch, publishEvent } from '../../../simulator/engine/dispatcher';
import { createInitialGameState } from '../../../simulator/engine/gameState';
import { theHerta, theHertaHandlerFactory } from '../the-herta';
import { Character, Enemy, PartyConfig } from '../../../types';
import { GameState, Unit } from '../../../simulator/engine/types';
import { createUnitId } from '../../../simulator/engine/unitId';
import { argenti } from '../argenti';

const getUnit = (state: GameState, id: string): Unit | undefined => {
    return state.registry.get(createUnitId(id));
};

describe('Madam Herta Implementation Test', () => {
    let initialState: GameState;
    const hertaId = 'the-herta-1';
    const argentiId = 'argenti-1';
    const bossId = 'boss-1';
    const eliteId = 'elite-1';
    const normalId = 'normal-1';

    beforeEach(() => {
        const characters: Character[] = [
            { ...theHerta, id: hertaId },
            { ...argenti, id: argentiId }
        ];

        const enemies: Enemy[] = [
            {
                id: bossId,
                name: 'Boss Enemy',
                rank: 'Boss',
                element: 'Physical',
                toughness: 120,
                baseRes: {},
                baseStats: { hp: 200000, atk: 1000, def: 1000, spd: 100, aggro: 100, critRate: 0.05, critDmg: 0.5 },
                abilities: { basic: { id: 'e-basic', name: 'Atk', type: 'Basic ATK', description: '' } as any } as any
            },
            {
                id: eliteId,
                name: 'Elite Enemy',
                rank: 'Elite',
                element: 'Ice',
                toughness: 100,
                baseRes: {},
                baseStats: { hp: 100000, atk: 1000, def: 1000, spd: 100, aggro: 100, critRate: 0.05, critDmg: 0.5 },
                abilities: { basic: { id: 'e-basic', name: 'Atk', type: 'Basic ATK', description: '' } as any } as any
            },
            {
                id: normalId,
                name: 'Normal Enemy',
                rank: 'Normal',
                element: 'Fire',
                toughness: 60,
                baseRes: {},
                baseStats: { hp: 50000, atk: 1000, def: 1000, spd: 100, aggro: 100, critRate: 0.05, critDmg: 0.5 },
                abilities: { basic: { id: 'e-basic', name: 'Atk', type: 'Basic ATK', description: '' } as any } as any
            }
        ];

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
            weaknesses: new Set(['Ice', 'Physical']) as Set<import('../../../types').Element>,
            enemyConfig: { level: 80, maxHp: 100000, toughness: 100, spd: 100 },
            partyConfig,
            rounds: 5
        };

        initialState = createInitialGameState(config);

        // Register handlers (usually handled by gameState creation if registered in registry, but we need to ensure local factory works)
        // createInitialGameState uses registry. Since we updated registry/index.ts, it SHOULD find 'the-herta'.
        // But in test environment, we might need to verify if registry is updated or if we need to manually inject.
        // The test above manually injects handlers, which is fine.

        const hertaHandler = theHertaHandlerFactory(hertaId, 80, 0);
        initialState = {
            ...initialState,
            eventHandlers: [...initialState.eventHandlers, hertaHandler.handlerMetadata],
            eventHandlerLogics: { ...initialState.eventHandlerLogics, [hertaHandler.handlerMetadata.id]: hertaHandler.handlerLogic }
        };

        // Ensure Argenti handler is also active for synergy (though not strictly needed if we just check stats presence)
        // But A4 trace checks party members path. Registry info is in Unit data.

        initialState = dispatch(initialState, { type: 'BATTLE_START' });
    });

    it('should apply initial Decipher to enemies on battle start', () => {
        const boss = getUnit(initialState, bossId);
        const elite = getUnit(initialState, eliteId);
        const normal = getUnit(initialState, normalId);

        // Talent: 敵が戦闘に入る時、1層付与
        expect(boss?.effects.find(e => e.id === 'the-herta-decipher')?.stackCount).toBe(1);
        expect(elite?.effects.find(e => e.id === 'the-herta-decipher')?.stackCount).toBe(1);
        expect(normal?.effects.find(e => e.id === 'the-herta-decipher')?.stackCount).toBe(1);
    });

    it('should apply 25 stacks of Decipher on wave start, prioritizing Elite+', () => {
        // Trigger Wave Start manually (using publishEvent as it is an Event, not Action)
        let state = publishEvent(initialState, { type: 'ON_WAVE_START', sourceId: 'system', value: 1 });

        const boss = getUnit(state, bossId);
        const elite = getUnit(state, eliteId);
        const normal = getUnit(state, normalId);

        // Priority: Boss > Elite > Normal.
        // Herta puts 25 stacks on ONE enemy.
        const bossStacks = boss?.effects.find(e => e.id === 'the-herta-decipher')?.stackCount;
        const eliteStacks = elite?.effects.find(e => e.id === 'the-herta-decipher')?.stackCount;

        // Since Boss is highest rank, it should get the stacks.
        // Initial 1 + 25 = 26.
        expect(bossStacks).toBe(26);
        expect(eliteStacks).toBe(1);
    });

    it('should acquire Sixth Sense on Ultimate use and modify Skill', () => {
        let state = initialState;

        // Set EP to max
        state = {
            ...state,
            registry: state.registry.update(createUnitId(hertaId), u => ({ ...u, ep: 220 }))
        };

        state = { ...state, currentTurnOwnerId: createUnitId(hertaId) };
        state = dispatch(state, { type: 'ULTIMATE', sourceId: hertaId, targetId: bossId });

        const herta = getUnit(state, hertaId);
        const sixthSense = herta?.effects.find(e => e.id === 'the-herta-sixth-sense');
        expect(sixthSense?.stackCount).toBeGreaterThanOrEqual(1);

        // Use Skill
        const initialHp = getUnit(state, bossId)?.hp;
        state = dispatch(state, { type: 'SKILL', sourceId: hertaId, targetId: bossId });

        const damageDealt = initialHp! - getUnit(state, bossId)?.hp!;
        expect(damageDealt).toBeGreaterThan(0);

        const hertaAfter = getUnit(state, hertaId);
        const sixthSenseAfter = hertaAfter?.effects.find(e => e.id === 'the-herta-sixth-sense');
        const afterStack = sixthSenseAfter?.stackCount || 0;
        const beforeStack = sixthSense?.stackCount || 0;
        expect(afterStack).toBe(beforeStack - 1);
    });

    it('should rearrange Decipher stacks on Ultimate', () => {
        let state = initialState;

        // Manually set stacks: Normal=40, Boss=1
        state = {
            ...state,
            registry: state.registry.update(createUnitId(normalId), u => ({
                ...u,
                effects: [...u.effects.filter(e => e.id !== 'the-herta-decipher'), {
                    id: 'the-herta-decipher', name: 'Decipher', stackCount: 40, category: 'DEBUFF', type: 'Debuff', duration: -1, modifiers: [], apply: (s: any) => s, remove: (s: any) => s, sourceUnitId: hertaId, durationType: 'PERMANENT'
                } as any]
            }))
        };

        state = { ...state, currentTurnOwnerId: createUnitId(hertaId) };
        state = dispatch(state, { type: 'ULTIMATE', sourceId: hertaId, targetId: bossId });

        const boss = getUnit(state, bossId);
        const normal = getUnit(state, normalId);

        const bossStacks = boss?.effects.find(e => e.id === 'the-herta-decipher')?.stackCount;
        const normalStacks = normal?.effects.find(e => e.id === 'the-herta-decipher')?.stackCount;

        expect(bossStacks).toBe(40);
        expect(normalStacks).toBeLessThan(40);
    });
});
