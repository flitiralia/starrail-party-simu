import { describe, it, expect } from 'vitest';
import * as LightCones from '../light-cones';
import { ILightConeData, PATHS } from '../../types';

// Get all Light Cones from exports
// Light Cones have: id, name, path, baseStats, passiveEffects, eventHandlers
const allLightCones: ILightConeData[] = Object.values(LightCones).filter((item: any) =>
    item && typeof item === 'object' && 'baseStats' in item && 'path' in item && 'passiveEffects' in item
) as ILightConeData[];

describe('Light Cones - Functional Tests', () => {
    describe('Passive Effects Validation', () => {
        it('should have passiveEffects array (can be empty)', () => {
            allLightCones.forEach(lc => {
                expect(Array.isArray(lc.passiveEffects)).toBe(true);
            });
        });

        it('passiveEffects should have valid structure', () => {
            allLightCones.forEach(lc => {
                if (lc.passiveEffects.length > 0) {
                    lc.passiveEffects.forEach(effect => {
                        expect(effect.id).toBeDefined();
                        expect(effect.name).toBeDefined();
                        expect(effect.category).toBeDefined();
                        expect(effect.targetStat).toBeDefined();
                        expect(Array.isArray(effect.effectValue)).toBe(true);
                        // Should have 5 values for 5 superimposition levels
                        expect(effect.effectValue.length).toBe(5);
                    });
                }
            });
        });

        it('effectValue should scale with superimposition', () => {
            allLightCones.forEach(lc => {
                if (lc.passiveEffects.length > 0) {
                    lc.passiveEffects.forEach(effect => {
                        // Values should generally increase (or stay same) with superimposition
                        const values = effect.effectValue;
                        for (let i = 0; i < values.length - 1; i++) {
                            expect(values[i]).toBeLessThanOrEqual(values[i + 1]);
                        }
                    });
                }
            });
        });
    });

    describe('Event Handlers Validation', () => {
        it('should have eventHandlers array if present', () => {
            allLightCones.forEach(lc => {
                // eventHandlers can be undefined or an array
                if (lc.eventHandlers !== undefined) {
                    expect(Array.isArray(lc.eventHandlers)).toBe(true);
                }
            });
        });

        it('eventHandlers should have valid structure', () => {
            allLightCones.forEach(lc => {
                if (lc.eventHandlers && lc.eventHandlers.length > 0) {
                    lc.eventHandlers.forEach(handler => {
                        expect(handler.id).toBeDefined();
                        expect(handler.name).toBeDefined();
                        expect(Array.isArray(handler.events)).toBe(true);
                        expect(handler.events.length).toBeGreaterThan(0);
                        expect(typeof handler.handler).toBe('function');
                    });
                }
            });
        });

        it('event types should be valid event names (start with ON_)', () => {
            allLightCones.forEach(lc => {
                if (lc.eventHandlers && lc.eventHandlers.length > 0) {
                    lc.eventHandlers.forEach(handler => {
                        handler.events.forEach(event => {
                            // All event types should start with ON_
                            expect(event.startsWith('ON_')).toBe(true);
                        });
                    });
                }
            });
        });
    });

    describe('Description Validation', () => {
        it('should have description and descriptionTemplate', () => {
            allLightCones.forEach(lc => {
                expect(typeof lc.description).toBe('string');
                expect(lc.description.length).toBeGreaterThan(0);
                expect(typeof lc.descriptionTemplate).toBe('string');
            });
        });

        it('descriptionValues should have 5 entries for 5 superimposition levels', () => {
            allLightCones.forEach(lc => {
                if (lc.descriptionValues) {
                    expect(lc.descriptionValues.length).toBe(5);
                }
            });
        });
    });

    describe('Specific Light Cone Tests', () => {
        describe('in-the-night', () => {
            const lc = allLightCones.find(l => l.id === 'in-the-night');

            it('should exist', () => {
                expect(lc).toBeDefined();
            });

            it('should be Hunt path', () => {
                expect(lc?.path).toBe('The Hunt');
            });

            it('should have crit rate passive effect', () => {
                const critEffect = lc?.passiveEffects.find(e => e.targetStat === 'crit_rate');
                expect(critEffect).toBeDefined();
                expect(critEffect?.effectValue[0]).toBe(0.18); // S1
                expect(critEffect?.effectValue[4]).toBe(0.30); // S5
            });

            it('should have speed scaling event handler', () => {
                const handler = lc?.eventHandlers?.find(h => h.id === 'in_the_night_spd_scaling');
                expect(handler).toBeDefined();
                expect(handler?.events).toContain('ON_BEFORE_DAMAGE_CALCULATION');
            });
        });

        describe('before-dawn', () => {
            const lc = allLightCones.find(l => l.id === 'before-dawn');

            it('should exist', () => {
                expect(lc).toBeDefined();
            });

            it('should be Erudition path', () => {
                expect(lc?.path).toBe('Erudition');
            });

            it('should have crit dmg passive effect', () => {
                const critEffect = lc?.passiveEffects.find(e => e.targetStat === 'crit_dmg');
                expect(critEffect).toBeDefined();
                expect(critEffect?.effectValue[0]).toBe(0.36); // S1
            });

            it('should have somnus gain and consume handlers', () => {
                const gainHandler = lc?.eventHandlers?.find(h => h.id === 'before_dawn_somnus_gain');
                const consumeHandler = lc?.eventHandlers?.find(h => h.id === 'before_dawn_somnus_consume');
                expect(gainHandler).toBeDefined();
                expect(consumeHandler).toBeDefined();
                expect(gainHandler?.events).toContain('ON_SKILL_USED');
                expect(gainHandler?.events).toContain('ON_ULTIMATE_USED');
            });
        });

        describe('subscribe-for-more', () => {
            const lc = allLightCones.find(l => l.id === 'subscribe-for-more');

            it('should exist', () => {
                expect(lc).toBeDefined();
            });

            it('should be Hunt path', () => {
                expect(lc?.path).toBe('The Hunt');
            });

            it('should have damage boost handler', () => {
                const handler = lc?.eventHandlers?.find(h => h.id === 'subscribe_for_more_dmg');
                expect(handler).toBeDefined();
                expect(handler?.events).toContain('ON_BEFORE_DAMAGE_CALCULATION');
            });
        });
    });

    describe('Base Stats Ranges', () => {
        it('5-star light cones should have higher base stats', () => {
            // 5-star LCs typically have HP > 1000
            const fiveStarSamples = ['in-the-night', 'before-dawn'];
            fiveStarSamples.forEach(id => {
                const lc = allLightCones.find(l => l.id === id);
                if (lc) {
                    expect(lc.baseStats.hp).toBeGreaterThan(1000);
                    expect(lc.baseStats.atk).toBeGreaterThan(500);
                }
            });
        });

        it('4-star light cones should have lower base stats', () => {
            // 4-star LCs typically have HP < 1000
            const fourStarSamples = ['subscribe-for-more'];
            fourStarSamples.forEach(id => {
                const lc = allLightCones.find(l => l.id === id);
                if (lc) {
                    expect(lc.baseStats.hp).toBeLessThan(1000);
                    expect(lc.baseStats.atk).toBeLessThan(500);
                }
            });
        });
    });
});
