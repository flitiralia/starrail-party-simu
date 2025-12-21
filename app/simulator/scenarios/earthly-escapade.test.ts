import { describe, test, expect, beforeEach } from 'vitest';
import { createInitialGameState } from '../engine/gameState';
import { dispatch } from '../engine/dispatcher';
import { GameState, Unit } from '../engine/types';
import { createUnitId } from '../engine/unitId';
import { earthlyEscapade } from '../../data/light-cones/earthly-escapade';
import { Character, PartyConfig } from '../../types';
import { addSkillPoints } from '../effect/relicEffectHelpers';

// Mock Characters since direct import might be flaky or unnecessary if we define inline
const mockWearer: Character = {
    id: 'wearer-1',
    name: 'Sparkle Mock',
    path: 'Harmony',
    element: 'Quantum',
    rarity: 5,
    maxEnergy: 110,
    baseStats: { hp: 1000, atk: 500, def: 500, spd: 100, critRate: 0.05, critDmg: 0.5, aggro: 100 },
    abilities: {
        basic: { id: 'basic', name: 'Basic', type: 'Basic ATK', description: '', damage: { scaling: 'atk', type: 'simple', hits: [{ multiplier: 1, toughnessReduction: 10 }] } },
        skill: { id: 'skill', name: 'Skill', type: 'Skill', description: '' },
        ultimate: { id: 'ult', name: 'Ult', type: 'Ultimate', description: '' },
        talent: { id: 'talent', name: 'Talent', type: 'Talent', description: '' },
        technique: { id: 'tech', name: 'Tech', type: 'Technique', description: '' }
    },
    traces: [],
    eidolons: {}
};

const mockAlly: Character = {
    id: 'ally-1',
    name: 'Ally Mock',
    path: 'Destruction',
    element: 'Physical',
    rarity: 5,
    maxEnergy: 100,
    baseStats: { hp: 1000, atk: 500, def: 500, spd: 100, critRate: 0.05, critDmg: 0.5, aggro: 100 },
    abilities: {
        basic: { id: 'ally-basic', name: 'Basic', type: 'Basic ATK', description: '', damage: { scaling: 'atk', type: 'simple', hits: [{ multiplier: 1, toughnessReduction: 10 }] } },
        skill: { id: 'ally-skill', name: 'Skill', type: 'Skill', description: '' },
        ultimate: { id: 'ally-ult', name: 'Ult', type: 'Ultimate', description: '' },
        talent: { id: 'ally-talent', name: 'Talent', type: 'Talent', description: '' },
        technique: { id: 'ally-tech', name: 'Tech', type: 'Technique', description: '' }
    },
    traces: [],
    eidolons: {}
};

describe('Light Cone: Earthly Escapade (人生は遊び)', () => {
    let state: GameState;
    const wearerId = 'wearer-1';
    const allyId = 'ally-1';

    beforeEach(() => {
        const characters: Character[] = [
            {
                ...mockWearer,
                equippedLightCone: {
                    lightCone: earthlyEscapade,
                    level: 80,
                    superimposition: 1
                }
            },
            mockAlly
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
            enemies: [], // No enemies needed for SP logic test
            weaknesses: new Set([]) as Set<import('../../types').Element>,
            enemyConfig: { level: 80, maxHp: 100000, toughness: 100, spd: 100 },
            partyConfig,
            rounds: 5
        };

        state = createInitialGameState(config);

        // Dispatch BATTLE_START to trigger initial effects
        state = dispatch(state, { type: 'BATTLE_START' });
    });

    test('Mask is applied at battle start', () => {
        const wearer = state.registry.get(createUnitId(wearerId))!;
        const ally = state.registry.get(createUnitId(allyId))!;

        // Check Mask on wearer
        const mask = wearer.effects.find(e => e.id.includes('earthly_escapade_mask'));
        expect(mask).toBeDefined();
        expect(mask?.duration).toBe(3);

        // Check Mask Buff on ally (from wearer's mask logic)
        // Note: applyMask logic applies effect to OTHER allies.
        const maskBuff = ally.effects.find(e => e.id.includes('earthly_escapade_mask_buff'));
        expect(maskBuff).toBeDefined();

        const crMod = maskBuff?.modifiers?.find(m => m.target === 'crit_rate');
        const cdMod = maskBuff?.modifiers?.find(m => m.target === 'crit_dmg');
        expect(crMod?.value).toBeCloseTo(0.10);
        expect(cdMod?.value).toBeCloseTo(0.28);

        // Wearer should NOT have the buff (self is excluded in apply logic)
        const wearerBuff = wearer.effects.find(e => e.id.includes('earthly_escapade_mask_buff'));
        expect(wearerBuff).toBeUndefined();
    });

    test('SP Gain adds Rainbow Flame stacks', () => {
        // Initial SP is usually max or per config. Let's set to 0.
        state = { ...state, skillPoints: 0 };

        // Wearer gains 1 SP
        state = addSkillPoints(state, 1, wearerId);

        const wearer = state.registry.get(createUnitId(wearerId))!;
        const flame = wearer.effects.find(e => e.name === '虹色の炎');
        expect(flame).toBeDefined();
        expect(flame?.stackCount).toBe(1);

        // Ally gains 1 SP (Should NOT add stack to wearer)
        state = addSkillPoints(state, 1, allyId);

        const wearer2 = state.registry.get(createUnitId(wearerId))!;
        const flame2 = wearer2.effects.find(e => e.name === '虹色の炎');
        expect(flame2?.stackCount).toBe(1);
    });

    test('Mask refreshes at 4 stacks', () => {
        state = { ...state, skillPoints: 0 };

        // Add 3 stacks
        state = addSkillPoints(state, 3, wearerId);
        let wearer = state.registry.get(createUnitId(wearerId))!;
        let flame = wearer.effects.find(e => e.name === '虹色の炎');
        expect(flame?.stackCount).toBe(3);

        // Ensure initial mask is duration 3 (applied at battle start)
        const initialMask = wearer.effects.find(e => e.id.includes('earthly_escapade_mask'));
        expect(initialMask?.duration).toBe(3);

        // Add 4th stack -> Trigger Mask Refresh (Duration 4)
        state = addSkillPoints(state, 1, wearerId);

        wearer = state.registry.get(createUnitId(wearerId))!;
        flame = wearer.effects.find(e => e.name === '虹色の炎');
        expect(flame).toBeUndefined(); // Should be reset

        const refreshedMask = wearer.effects.find(e => e.id.includes('earthly_escapade_mask'));
        expect(refreshedMask).toBeDefined();
        expect(refreshedMask?.duration).toBe(4);
    });
});
