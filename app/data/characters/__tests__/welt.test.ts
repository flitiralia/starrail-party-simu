import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GameState } from '../../../simulator/engine/types';
import { createInitialGameState } from '../../../simulator/engine/gameState';
import { welt, weltHandlerFactory } from '../welt';
import { createUnitId } from '../../../simulator/engine/unitId';
import { SimulationConfig, Enemy } from '../../../types/index';
import { getLeveledValue } from '../../../simulator/utils/abilityLevel';

describe('ヴェルト (Welt) Character Implementation', () => {
    let state: GameState;
    const charId = 'welt-test';
    const enemyId = 'enemy-0';
    const enemy2Id = 'enemy-1';

    beforeEach(() => {
        const weltUnit = { ...welt, id: charId };
        const enemyUnit: Enemy = {
            id: enemyId,
            name: 'Enemy',
            baseStats: { hp: 10000, atk: 500, def: 200, spd: 100, critRate: 0.05, critDmg: 0.50, aggro: 0 },
            element: 'Imaginary',
            toughness: 100,
            baseRes: {},
            abilities: {
                basic: { id: 'e-b', name: 'B', type: 'Basic ATK', description: '' },
                skill: { id: 'e-s', name: 'S', type: 'Skill', description: '' },
                ultimate: { id: 'e-u', name: 'U', type: 'Ultimate', description: '' },
                talent: { id: 'e-t', name: 'T', type: 'Talent', description: '' },
                technique: { id: 'e-tech', name: 'Te', type: 'Technique', description: '' }
            }
        };
        const enemyUnit2: Enemy = { ...enemyUnit, id: enemy2Id, name: 'Enemy 2' };

        const config: SimulationConfig = {
            characters: [weltUnit],
            enemies: [enemyUnit, enemyUnit2],
            weaknesses: new Set(['Imaginary']),
            partyConfig: {
                members: [{ character: weltUnit, config: { rotation: [], ultStrategy: 'immediate', ultCooldown: 0 }, enabled: true, eidolonLevel: 6 }]
            },
            enemyConfig: { level: 80, maxHp: 10000, toughness: 100, spd: 100 },
            rounds: 5
        };

        state = createInitialGameState(config);

        // Register Handler
        const factory = weltHandlerFactory(charId, 80, 0);
        state.eventHandlers.push(factory.handlerMetadata);
        state.eventHandlerLogics[factory.handlerMetadata.id] = factory.handlerLogic;
    });

    it('Technique: Should apply Imprisonment and Delay Action on Battle Start', () => {
        const factory = weltHandlerFactory(charId, 80, 0);

        // Capture initial AV
        const enemyBefore = state.registry.get(createUnitId(enemyId))!;
        const initialAV = enemyBefore.actionValue;

        // Trigger ON_BATTLE_START
        state = factory.handlerLogic({ type: 'ON_BATTLE_START', sourceId: charId } as any, state, factory.handlerMetadata.id);

        const enemy = state.registry.get(createUnitId(enemyId))!;
        const impEffect = enemy.effects.find(e => e.name.includes('禁錮'));

        expect(impEffect).toBeDefined();
        // Check Speed Reduction (-10%)
        const spdMod = impEffect!.modifiers!.find(m => m.target === 'spd_pct');
        expect(spdMod?.value).toBe(-0.10);

        // Check Action Delay (20%)
        // Imprisonment reduces Speed by 10% (100 -> 90).
        // New Base AV = 10000 / 90 = 111.111...
        // Delay (20%) adds 20% of Base AV = 22.222...
        // Total Expected AV = 111.111 + 22.222 = 133.333...
        expect(enemy.actionValue).toBeGreaterThan(initialAV);
        expect(enemy.actionValue).toBeCloseTo((10000 / 90) * 1.20, 0); // ~133.33
    });

    it('Skill: Should apply Slow on hit (mocked)', () => {
        const factory = weltHandlerFactory(charId, 80, 0);

        // Mock Math.random to ensure hit
        const originalRandom = Math.random;
        Math.random = () => 0.0;

        // Setup Action Log
        state.currentActionLog = {
            primaryActionType: 'SKILL',
            primaryTargetId: enemyId,
            sourceId: charId,
            primaryDamage: { hitDetails: [], totalDamage: 0 },
            additionalDamage: [],
            resourceChanges: [],
            damageTaken: [],
            healing: [],
            shields: [],
            dotDetonations: [],
            equipmentEffects: []
        } as any;

        // Trigger ON_DAMAGE_DEALT
        state = factory.handlerLogic({
            type: 'ON_DAMAGE_DEALT',
            sourceId: charId,
            targetId: enemyId,
            value: 100
        } as any, state, factory.handlerMetadata.id);

        const enemy = state.registry.get(createUnitId(enemyId))!;
        const slowEffect = enemy.effects.find(e => e.name.includes('虚空断界'));
        expect(slowEffect).toBeDefined();
        expect(slowEffect!.modifiers![0].value).toBe(-0.10);

        Math.random = originalRandom;
    });

    it('Ultimate: Should Imprison, Delay, apply A2 Vuln, and restore A4 Energy', () => {
        const factory = weltHandlerFactory(charId, 80, 0);

        // Add A2 and A4 traces manually to unit in registry
        const unit = state.registry.get(createUnitId(charId))!;
        unit.traces = [
            { id: 'welt-trace-a2', name: 'A2', type: 'Bonus Ability', description: '' },
            { id: 'welt-trace-a4', name: 'A4', type: 'Bonus Ability', description: '' }
        ];

        const initialEnergy = unit.ep;

        // Trigger ON_ULTIMATE_USED
        state = factory.handlerLogic({
            type: 'ON_ULTIMATE_USED',
            sourceId: charId,
            targetId: enemyId
        } as any, state, factory.handlerMetadata.id);

        // Check Imprisonment
        const enemy = state.registry.get(createUnitId(enemyId))!;
        expect(enemy.effects.find(e => e.name.includes('禁錮'))).toBeDefined();

        // Check A2 Vulnerability
        const vuln = enemy.effects.find(e => e.name.includes('懲戒'));
        expect(vuln).toBeDefined();
        expect(vuln!.modifiers![0].target).toBe('all_type_vuln');
        expect(vuln!.modifiers![0].value).toBe(0.12);

        // Check A4 Energy (+10)
        const unitAfter = state.registry.get(createUnitId(charId))!;
        expect(unitAfter.ep).toBe(initialEnergy + 10);
    });

    it('Talent: Should trigger Additional Damage against Slowed enemies', () => {
        const factory = weltHandlerFactory(charId, 80, 0);

        // Apply Slow to enemy
        const enemy = state.registry.get(createUnitId(enemyId))!;
        enemy.effects.push({
            id: 'dummy-slow',
            name: 'Slow',
            sourceUnitId: charId,
            category: 'DEBUFF',
            durationType: 'TURN_END_BASED',
            duration: 2,
            modifiers: [{ target: 'spd_pct', value: -0.10, type: 'add', source: 'test' }],
            apply: (t, s) => s, remove: (t, s) => s
        });

        // Setup Action Log
        state.currentActionLog = {
            primaryActionType: 'SKILL',
            primaryTargetId: enemyId,
            sourceId: charId,
            additionalDamage: [],
            // ... other props
        } as any;

        // Trigger ON_DAMAGE_DEALT
        state = factory.handlerLogic({
            type: 'ON_DAMAGE_DEALT',
            sourceId: charId,
            targetId: enemyId,
            value: 100, // Dummy value
            damageType: 'Skill' // Not 'Additional Damage'
        } as any, state, factory.handlerMetadata.id);

        // Check Action Log for Additional Damage Entry
        const talentDmg = state.currentActionLog!.additionalDamage.find(ad => ad.name === '時空の歪み');
        expect(talentDmg).toBeDefined();
        expect(talentDmg!.damage).toBeGreaterThan(0);

        // E2 check: Energy on Talent
        // Need to check energy increase.
        // We didn't capture initial energy here, but base is 120/2. Default start is 50% usually + technique?
        // Let's just check if energy > initial (assuming it was 60).
        // Actually unit starts with 60 (50%).
        const unit = state.registry.get(createUnitId(charId))!;
        expect(unit.ep).toBeGreaterThan(60); // Should have gained 3 EP
    });

    it('E1: Should trigger Bonus Damage after Basic/Skill following Ult', () => {
        const factory = weltHandlerFactory(charId, 80, 0);
        // Ensure unit has E1
        let unit = state.registry.get(createUnitId(charId))!;
        unit.eidolonLevel = 1;

        // 1. Ult
        state = factory.handlerLogic({ type: 'ON_ULTIMATE_USED', sourceId: charId } as any, state, factory.handlerMetadata.id);
        unit = state.registry.get(createUnitId(charId))!;
        expect(unit.effects.find(e => e.name.includes('名の継承'))).toBeDefined();

        // 2. Skill Action
        state.currentActionLog = {
            primaryActionType: 'SKILL',
            primaryTargetId: enemyId,
            sourceId: charId,
            additionalDamage: [],
        } as any;

        // Trigger ON_DAMAGE_DEALT
        state = factory.handlerLogic({
            type: 'ON_DAMAGE_DEALT',
            sourceId: charId,
            targetId: enemyId,
            value: 100,
            damageType: 'Skill'
        } as any, state, factory.handlerMetadata.id);

        // Check E1 Damage in Log
        const e1Dmg = state.currentActionLog!.additionalDamage.find(ad => ad.name === '名の継承');
        expect(e1Dmg).toBeDefined();
        expect(e1Dmg!.damage).toBeGreaterThan(0);

        // 3. Complete Action -> Consume Stack
        state = factory.handlerLogic({ type: 'ON_ACTION_COMPLETE', sourceId: charId } as any, state, factory.handlerMetadata.id);
        unit = state.registry.get(createUnitId(charId))!;
        const buff = unit.effects.find(e => e.name.includes('名の継承'))!;
        expect(buff.stackCount).toBe(1);
    });

    it('E6: Should add extra hit to Skill', () => {
        const factory = weltHandlerFactory(charId, 80, 0);
        // Initialize logic for E6 happens on ON_BATTLE_START
        state = factory.handlerLogic({ type: 'ON_BATTLE_START', sourceId: charId } as any, state, factory.handlerMetadata.id);

        const unit = state.registry.get(createUnitId(charId))!;
        const skill = unit.abilities.skill;
        if (skill.damage && skill.damage.type === 'bounce') {
            expect(skill.damage.hits?.length).toBe(4);
        } else {
            throw new Error('Skill damage structure incorrect');
        }
    });
});
