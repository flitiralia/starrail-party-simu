import { describe, it, expect, beforeEach } from 'vitest';
import { GameState, Unit } from '../engine/types';
import { createUnitId } from '../engine/unitId';
import { aglaea } from '../../data/characters/aglaea';
import { castorice } from '../../data/characters/castorice';
import { createInitialGameState } from '../engine/gameState';
import { SimulationConfig } from '../../types/index';
import { summonOrRefreshSpirit, IMemorySpiritDefinition } from '../engine/memorySpiritManager';
import { calculateFinalStats } from '../statBuilder';

// Mock Config
const mockConfig: SimulationConfig = {
    characters: [],
    enemies: [],
    weaknesses: new Set(),
    partyConfig: { members: [] },
    enemyConfig: { level: 80, maxHp: 100000, toughness: 300, spd: 132 }
};

describe('Aggro Verification', () => {
    let state: GameState;

    beforeEach(() => {
        state = createInitialGameState(mockConfig);
    });

    it('Aglaea base aggro should be 100', () => {
        expect(aglaea.baseStats.aggro).to.equal(100);
    });

    it('Castorice base aggro should be 100', () => {
        expect(castorice.baseStats.aggro).to.equal(100);
    });

    it('Raftra aggro should be 125', () => {
        // Create Aglaea unit
        const aglaeaUnit: Unit = {
            id: createUnitId('aglaea-test'),
            name: 'Aglaea',
            stats: { ...aglaea.baseStats } as any,
            baseStats: { ...aglaea.baseStats } as any,
            isSummon: false,
            isEnemy: false,
            ownerId: undefined,
            linkedUnitId: undefined,
            element: 'Lightning',
            level: 80,
            ep: 0,
            effects: [],
            modifiers: [],
            abilities: aglaea.abilities,
            hp: 1, shield: 0, toughness: 0, maxToughness: 0, weaknesses: new Set(),
            actionValue: 0, rotationIndex: 0, ultCooldown: 0
        };

        // Initialize state with Aglaea
        state = {
            ...state,
            registry: state.registry.update(aglaeaUnit.id, u => aglaeaUnit)
        };

        // Manually create Raftra definition as per aglaea.ts
        const raftraDef: IMemorySpiritDefinition = {
            idPrefix: 'raftra',
            name: 'Raftra',
            element: 'Lightning',
            hpMultiplier: 0.66,
            baseSpd: 100,
            baseAggro: 125, // Explicitly testing this property usage
            abilities: {} as any
        };

        // Summon Raftra
        const summonResult = summonOrRefreshSpirit(state, aglaeaUnit, raftraDef);
        const raftra = summonResult.spirit;

        // Verify Raftra's aggro
        // Note: verify both baseStats.aggro and calculated stats.aggro
        expect(raftra.baseStats.aggro).to.equal(125);

        // Calculate final stats to ensure it propagates
        const finalStats = calculateFinalStats(raftra, state);
        expect(finalStats.aggro).to.equal(125);
    });

    it('Siryu aggro should be 100 (default)', () => {
        // Create Castorice unit
        const castoriceUnit: Unit = {
            id: createUnitId('castorice-test'),
            name: 'Castorice',
            stats: { ...castorice.baseStats } as any,
            baseStats: { ...castorice.baseStats } as any,
            isSummon: false,
            isEnemy: false,
            ownerId: undefined,
            linkedUnitId: undefined,
            element: 'Quantum',
            level: 80,
            ep: 0,
            effects: [],
            modifiers: [],
            abilities: castorice.abilities,
            hp: 1, shield: 0, toughness: 0, maxToughness: 0, weaknesses: new Set(),
            actionValue: 0, rotationIndex: 0, ultCooldown: 0
        };

        // Initialize state with Castorice
        state = {
            ...state,
            registry: state.registry.update(castoriceUnit.id, u => castoriceUnit)
        };

        // Manually create Siryu definition (no baseAggro specified, should inherit or default)
        const siryuDef: IMemorySpiritDefinition = {
            idPrefix: 'siryu',
            name: 'Siryu',
            element: 'Quantum',
            hpMultiplier: 1.0,
            baseSpd: 100,
            abilities: {} as any
        };

        // Summon Siryu
        const summonResult = summonOrRefreshSpirit(state, castoriceUnit, siryuDef);
        const siryu = summonResult.spirit;

        // Verify Siryu's aggro
        // Logic in memorySpiritManager: definition.baseAggro ?? owner.stats.aggro ?? 100
        // Owner (Castorice) has aggro 100, definition has undefined. Should be 100.
        expect(siryu.baseStats.aggro).to.equal(100);

        const finalStats = calculateFinalStats(siryu, state);
        expect(finalStats.aggro).to.equal(100);
    });
});
