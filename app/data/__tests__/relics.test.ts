import { describe, it, expect } from 'vitest';
import * as Relics from '../relics';
import { RelicSet } from '../../types';

// Get all Relic Sets from exports
const allRelicSets: RelicSet[] = Object.values(Relics).filter((item: any) =>
    item && typeof item === 'object' && 'setBonuses' in item
) as RelicSet[];

describe('Relic Sets - Functional Tests', () => {
    describe('Set Bonuses Validation', () => {
        it('should have setBonuses array', () => {
            allRelicSets.forEach(relic => {
                expect(Array.isArray(relic.setBonuses)).toBe(true);
                expect(relic.setBonuses.length).toBeGreaterThan(0);
            });
        });

        it('should have valid pieces count (2 or 4)', () => {
            allRelicSets.forEach(relic => {
                relic.setBonuses.forEach(bonus => {
                    expect([2, 4]).toContain(bonus.pieces);
                });
            });
        });

        it('should have description for each set bonus', () => {
            allRelicSets.forEach(relic => {
                relic.setBonuses.forEach(bonus => {
                    expect(typeof bonus.description).toBe('string');
                    expect(bonus.description.length).toBeGreaterThan(0);
                });
            });
        });
    });

    describe('2-Piece Effects Validation', () => {
        it('2-piece bonuses with passiveEffects should have valid structure', () => {
            allRelicSets.forEach(relic => {
                const twoPiece = relic.setBonuses.find(b => b.pieces === 2);
                if (twoPiece?.passiveEffects) {
                    twoPiece.passiveEffects.forEach(effect => {
                        expect(effect.stat).toBeDefined();
                        expect(typeof effect.value).toBe('number');
                        expect(effect.target).toBeDefined();
                    });
                }
            });
        });

        it('passiveEffects values should be reasonable percentages', () => {
            allRelicSets.forEach(relic => {
                const twoPiece = relic.setBonuses.find(b => b.pieces === 2);
                if (twoPiece?.passiveEffects) {
                    twoPiece.passiveEffects.forEach(effect => {
                        // Most 2-piece bonuses are between 0.05 and 0.20 (5-20%)
                        expect(effect.value).toBeGreaterThan(0);
                        expect(effect.value).toBeLessThanOrEqual(1.0);
                    });
                }
            });
        });
    });

    describe('4-Piece Effects Validation', () => {
        it('4-piece bonuses with eventHandlers should have valid structure', () => {
            allRelicSets.forEach(relic => {
                const fourPiece = relic.setBonuses.find(b => b.pieces === 4);
                if (fourPiece?.eventHandlers) {
                    fourPiece.eventHandlers.forEach(handler => {
                        expect(Array.isArray(handler.events)).toBe(true);
                        expect(handler.events.length).toBeGreaterThan(0);
                        expect(typeof handler.handler).toBe('function');
                    });
                }
            });
        });

        it('event types should be valid event names (start with ON_)', () => {
            allRelicSets.forEach(relic => {
                const fourPiece = relic.setBonuses.find(b => b.pieces === 4);
                if (fourPiece?.eventHandlers) {
                    fourPiece.eventHandlers.forEach(handler => {
                        handler.events.forEach(event => {
                            // All event types should start with ON_
                            expect(event.startsWith('ON_')).toBe(true);
                        });
                    });
                }
            });
        });
    });

    describe('Specific Relic Set Tests', () => {
        describe('genius_of_brilliant_stars', () => {
            const relic = allRelicSets.find(r => r.id === 'genius_of_brilliant_stars');

            it('should exist', () => {
                expect(relic).toBeDefined();
            });

            it('should have 2pc quantum damage boost', () => {
                const twoPiece = relic?.setBonuses.find(b => b.pieces === 2);
                expect(twoPiece).toBeDefined();
                const quantumBoost = twoPiece?.passiveEffects?.find(e => e.stat === 'quantum_dmg_boost');
                expect(quantumBoost).toBeDefined();
                expect(quantumBoost?.value).toBe(0.1);
            });

            it('should have 4pc defense ignore handler', () => {
                const fourPiece = relic?.setBonuses.find(b => b.pieces === 4);
                expect(fourPiece).toBeDefined();
                expect(fourPiece?.eventHandlers).toBeDefined();
                expect(fourPiece?.eventHandlers?.[0].events).toContain('ON_BEFORE_DAMAGE_CALCULATION');
            });
        });

        describe('longevous_disciple', () => {
            const relic = allRelicSets.find(r => r.id === 'longevous_disciple');

            it('should exist', () => {
                expect(relic).toBeDefined();
            });

            it('should have 2pc max HP boost', () => {
                const twoPiece = relic?.setBonuses.find(b => b.pieces === 2);
                expect(twoPiece).toBeDefined();
                const hpBoost = twoPiece?.passiveEffects?.find(e => e.stat === 'hp_pct');
                expect(hpBoost).toBeDefined();
                expect(hpBoost?.value).toBe(0.12);
            });

            it('should have 4pc crit rate stacking handler', () => {
                const fourPiece = relic?.setBonuses.find(b => b.pieces === 4);
                expect(fourPiece).toBeDefined();
                expect(fourPiece?.eventHandlers).toBeDefined();
                // Should trigger on hit received and HP consumed
                const events = fourPiece?.eventHandlers?.[0].events || [];
                expect(events).toContain('ON_HP_CONSUMED');
            });
        });

        describe('champion_of_streetwise_boxing', () => {
            const relic = allRelicSets.find(r => r.id === 'champion_of_streetwise_boxing');

            it('should exist', () => {
                expect(relic).toBeDefined();
            });

            it('should have 2pc physical damage boost', () => {
                const twoPiece = relic?.setBonuses.find(b => b.pieces === 2);
                expect(twoPiece).toBeDefined();
                const physBoost = twoPiece?.passiveEffects?.find(e => e.stat === 'physical_dmg_boost');
                expect(physBoost).toBeDefined();
                expect(physBoost?.value).toBe(0.1);
            });

            it('should have 4pc ATK stacking handler', () => {
                const fourPiece = relic?.setBonuses.find(b => b.pieces === 4);
                expect(fourPiece).toBeDefined();
                expect(fourPiece?.eventHandlers).toBeDefined();
                // Should trigger on attack and hit received
                const events = fourPiece?.eventHandlers?.[0].events || [];
                expect(events).toContain('ON_ATTACK');
                expect(events).toContain('ON_BEFORE_HIT');
            });
        });
    });

    describe('ID and Name Validation', () => {
        it('should have unique IDs', () => {
            const ids = new Set<string>();
            const duplicates: string[] = [];
            allRelicSets.forEach(relic => {
                if (ids.has(relic.id)) {
                    duplicates.push(relic.id);
                }
                ids.add(relic.id);
            });
            expect(duplicates).toEqual([]);
        });

        it('should have non-empty names', () => {
            allRelicSets.forEach(relic => {
                expect(typeof relic.name).toBe('string');
                expect(relic.name.length).toBeGreaterThan(0);
            });
        });
    });
});
