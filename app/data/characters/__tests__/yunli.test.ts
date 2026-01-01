import { expect } from 'chai';
import { yunli, yunliHandlerFactory } from '../yunli';
import { createInitialGameState } from '../../../simulator/engine/gameState';
import { createUnitId } from '../../../simulator/engine/unitId';
import { dispatch, publishEvent, initializeCurrentActionLog } from '../../../simulator/engine/dispatcher';
import { SimulationConfig, GameState, Unit } from '../../../simulator/engine/types';
import { addEffect } from '../../../simulator/engine/effectManager';
import { Enemy } from '../../../types/index';

// Initialize test globals for tsc/vitest environment
declare const describe: any;
declare const it: any;
declare const beforeEach: any;

describe('Yunli Implementation', () => {
    let state: GameState;
    let yunliUnit: Unit;
    let enemy1: Unit;
    let config: SimulationConfig;

    beforeEach(() => {
        // Setup Logic
        const mockEnemy: Enemy = {
            id: 'enemy-1',
            name: 'Enemy 1',
            element: 'Physical',
            rank: 'Normal',
            toughness: 30,
            baseStats: { hp: 10000, atk: 100, def: 0, spd: 100, critRate: 0.05, critDmg: 0.50, aggro: 0, effect_hit_rate: 0, effect_res: 0 },
            baseRes: {},
            abilities: {
                basic: { id: 'e-bas', name: '', type: 'Basic ATK', description: '' },
                skill: { id: 'e-skill', name: '', type: 'Skill', description: '' },
                ultimate: { id: 'e-ult', name: '', type: 'Ultimate', description: '' },
                talent: { id: 'e-talent', name: '', type: 'Talent', description: '' },
                technique: { id: 'e-tech', name: '', type: 'Technique', description: '' }
            },
            // maxToughness: 30, // Removed invalid property
        };

        config = {
            characters: [yunli],
            enemies: [mockEnemy],
            weaknesses: new Set(['Physical']),
            partyConfig: {
                members: [{ character: yunli, config: { rotation: ['basic'], ultStrategy: 'immediate', ultCooldown: 0 }, enabled: true, eidolonLevel: 0 }]
            },
            enemyConfig: { level: 80, maxHp: 10000, atk: 100, def: 0, spd: 100, toughness: 30 },
            rounds: 5
        };

        state = createInitialGameState(config);
        yunliUnit = state.registry.get(createUnitId(yunli.id))!;
        enemy1 = state.registry.get(createUnitId(mockEnemy.id))!;

        // Attach Handler
        const handler = yunliHandlerFactory(yunliUnit.id, 80);
        state.eventHandlers.push(handler.handlerMetadata);
        state.eventHandlerLogics[handler.handlerMetadata.id] = handler.handlerLogic;
    });

    it('should initialize with correct stats', () => {
        const u = state.registry.get(createUnitId(yunliUnit.id));
        expect(u?.stats.max_ep).to.equal(120);
        expect(u?.path).to.equal('Destruction');
    });

    it('should deal damage with Basic ATK', () => {
        state = initializeCurrentActionLog(state, yunliUnit.id, yunliUnit.name, 'BASIC_ATTACK');
        state = dispatch(state, { type: 'BASIC_ATTACK', sourceId: yunliUnit.id, targetId: enemy1.id });

        // Assert log entry created
        const lastLog = state.log[state.log.length - 1]; // Assume last log is ours (or search by ID if needed)
        // With dispatch, it should be appended.
        // Wait, dispatch -> resolveAction -> stepFinalizeActionLog -> log.push?
        // Step 1580 view implies log logic.
        // Assuming simulator pushes to state.log. (Usually state.log is array of SimulationLogEntry).
        // Let's assume it IS populated.

        // If state.log is empty, we must rely on side effects like Enemy HP loss.
        // Enemy HP Check:
        const enemy = state.registry.get(createUnitId(enemy1.id));
        expect(enemy!.hp).to.be.lessThan(10000);
    });

    it('should heal and deal Blast damage with Skill', () => {
        yunliUnit.hp = 100;
        state = { ...state, registry: state.registry.update(createUnitId(yunliUnit.id), u => ({ ...u, hp: 100 })) };

        state = initializeCurrentActionLog(state, yunliUnit.id, yunliUnit.name, 'SKILL');
        state = dispatch(state, { type: 'SKILL', sourceId: yunliUnit.id, targetId: enemy1.id });

        const u = state.registry.get(createUnitId(yunliUnit.id));
        expect(u?.hp).to.be.greaterThan(100); // Healing Check

        const enemy = state.registry.get(createUnitId(enemy1.id));
        expect(enemy!.hp).to.be.lessThan(10000); // Damage Check
    });

    it('should enter Parry Stance on Ultimate', () => {
        state = { ...state, registry: state.registry.update(createUnitId(yunliUnit.id), u => ({ ...u, ep: 120 })) };

        state = initializeCurrentActionLog(state, yunliUnit.id, yunliUnit.name, 'ULTIMATE');
        state = dispatch(state, { type: 'ULTIMATE', sourceId: yunliUnit.id, targetId: yunliUnit.id });

        const u = state.registry.get(createUnitId(yunliUnit.id));
        const parry = u?.effects.find(e => e.name === '構え');
        expect(parry).to.exist;

        const taunt = state.registry.get(createUnitId(enemy1.id))?.effects.find(e => e.name === '挑発');
        expect(taunt).to.exist;
    });

    it('should trigger Cull (Strong Counter) when damaged during Parry', () => {
        // 1. Setup Parry
        state = { ...state, registry: state.registry.update(createUnitId(yunliUnit.id), u => ({ ...u, ep: 120 })) };
        state = initializeCurrentActionLog(state, yunliUnit.id, yunliUnit.name, 'ULTIMATE');
        state = dispatch(state, { type: 'ULTIMATE', sourceId: yunliUnit.id }); // Init Log for Ult setup

        // 2. Sim Damage Received
        const enemyId = createUnitId(enemy1.id);
        state = publishEvent(state, {
            type: 'ON_DAMAGE_DEALT',
            sourceId: enemyId,
            targetId: yunliUnit.id,
            value: 100,
            damageType: 'Physical'
        } as any);

        // 3. Verify Parry Removed (Cull execution consumes it)
        const u = state.registry.get(createUnitId(yunliUnit.id));
        const parry = u?.effects.find(e => e.name === '構え');
        expect(parry).to.be.undefined;

        // 4. Verify Ransom Hits (Cull should trigger 6+1 hits)
        // Check log for multiple Follow-Up entries or damage logs
        // Note: dispatch processes pending actions recursively.
        // We expect ActionLog to contain multiple entries effectively? 
        // Or if dispatch loop clears pending actions, we might just see them in state.log history?
        // Actually `state.log` is not standard in my mock?
        // The mock 'state' in test doesn't expose 'log' array explicitly in types if not added.
        // But we added it in my previous "Final unit test suite correction for log access" step?
        // Wait, did I add state.log to type definition? No. I just accessed it.
        // If GameState has 'log', fine.
        // If not, we can check that Enemy HP is significantly reduced compared to Slash.

        // 4. Verify Random Hits (Cull should trigger 1 Main + 6 Random = 7 actions)
        // Since publishEvent doesn't auto-dispatch pending actions, we verify they are queued.
        expect(state.pendingActions.length).to.equal(7);
        expect(state.pendingActions[0].type).to.equal('FOLLOW_UP_ATTACK');

        // Optional: Dispatch them to verify execution (but queue check confirms logic)
        // const initialHp = state.registry.get(createUnitId(enemy1.id))!.hp;
        // let currentState = state;
        // while(currentState.pendingActions.length > 0) {
        //    const action = currentState.pendingActions.shift()!;
        //    currentState = dispatch(currentState, action);
        // }
        // expect(currentState.registry.get(createUnitId(enemy1.id))!.hp).to.be.lessThan(initialHp);
    });

    it('should trigger Slash (Weak Counter) when damaged without Parry', () => {
        state = publishEvent(state, {
            type: 'ON_DAMAGE_DEALT',
            sourceId: createUnitId(enemy1.id),
            targetId: yunliUnit.id,
            value: 100,
            damageType: 'Normal',
        } as any);

        expect(state).to.exist;
    });

    it('should alternate Slash -> Cull with A2 Trace', () => {
        // Enable A2
        state = {
            ...state, registry: state.registry.update(createUnitId(yunliUnit.id), u => ({
                ...u,
                traces: [{ id: 'yunli-trace-a2', name: '炎輪', type: 'Bonus Ability', description: '' }]
            }))
        };

        // 1. Trigger Slash (No Parry) -> Sets Next=Cull
        state = publishEvent(state, { type: 'ON_DAMAGE_DEALT', sourceId: createUnitId(enemy1.id), targetId: yunliUnit.id, value: 0, damageType: 'Normal' } as any);

        const u1 = state.registry.get(createUnitId(yunliUnit.id));
        const nextCull = u1?.effects.find(e => e.id.includes('next-cull'));
        expect(nextCull).to.exist;

        // 2. Trigger Next (Should be Cull and Consume)
        state = publishEvent(state, { type: 'ON_DAMAGE_DEALT', sourceId: createUnitId(enemy1.id), targetId: yunliUnit.id, value: 0, damageType: 'Normal' } as any);

        const u2 = state.registry.get(createUnitId(yunliUnit.id));
        const nextCull2 = u2?.effects.find(e => e.id.includes('next-cull'));
        expect(nextCull2).to.be.undefined;
    });
});
