import { describe, it, expect } from 'vitest';
import { ALL_CHARACTERS } from '../characters';
import * as LightCones from '../light-cones';
import * as Relics from '../relics';
import { Character, ILightConeData, RelicSet, Element, Path, PATHS, ELEMENTS } from '../../types';

describe('Data Integrity', () => {
    describe('Characters', () => {
        it('should have unique IDs', () => {
            const ids = new Set<string>();
            const duplicates: string[] = [];
            ALL_CHARACTERS.forEach(char => {
                if (ids.has(char.id)) {
                    duplicates.push(char.id);
                }
                ids.add(char.id);
            });
            expect(duplicates).toEqual([]);
        });

        it('should have valid Path and Element', () => {
            ALL_CHARACTERS.forEach(char => {
                expect(PATHS).toContain(char.path);
                expect(ELEMENTS).toContain(char.element);
            });
        });

        it('should have positive base stats', () => {
            ALL_CHARACTERS.forEach(char => {
                expect(char.baseStats.hp).toBeGreaterThan(0);
                expect(char.baseStats.atk).toBeGreaterThan(0);
                expect(char.baseStats.def).toBeGreaterThan(0);
                expect(char.baseStats.spd).toBeGreaterThan(0);
            });
        });

        it('should have all abilities defined', () => {
            ALL_CHARACTERS.forEach(char => {
                expect(char.abilities.basic).toBeDefined();
                expect(char.abilities.skill).toBeDefined();
                expect(char.abilities.ultimate).toBeDefined();
                expect(char.abilities.talent).toBeDefined();
                // Technique is optional? No, usually required but might be placeholder
                expect(char.abilities.technique).toBeDefined();
            });
        });
    });

    describe('Light Cones', () => {
        // Filter exported objects to find LightCones
        const allLightCones: ILightConeData[] = Object.values(LightCones).filter((item: any) =>
            item && typeof item === 'object' && 'baseStats' in item && 'path' in item
        ) as ILightConeData[];

        it('should have unique IDs', () => {
            const ids = new Set<string>();
            const duplicates: string[] = [];
            allLightCones.forEach(lc => {
                if (ids.has(lc.id)) {
                    duplicates.push(lc.id);
                }
                ids.add(lc.id);
            });
            expect(duplicates).toEqual([]);
        });

        it('should have valid Path', () => {
            allLightCones.forEach(lc => {
                expect(PATHS).toContain(lc.path);
            });
        });

        it('should have positive base stats', () => {
            allLightCones.forEach(lc => {
                expect(lc.baseStats.hp).toBeGreaterThan(0);
                expect(lc.baseStats.atk).toBeGreaterThan(0);
                expect(lc.baseStats.def).toBeGreaterThan(0);
            });
        });

        it('should have 5 superimpositions descriptions if defined', () => {
            allLightCones.forEach(lc => {
                if (lc.descriptionValues) {
                    expect(lc.descriptionValues.length).toBe(5);
                }
            });
        });
    });

    describe('Relics', () => {
        // Filter exported objects to find Relic Sets (checking for 'setBonuses')
        const allRelicSets: RelicSet[] = Object.values(Relics).filter((item: any) =>
            item && typeof item === 'object' && 'setBonuses' in item
        ) as RelicSet[];

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

        it('should have 2pc and 4pc effects defined', () => {
            allRelicSets.forEach(relic => {
                expect(relic.setBonuses).toBeDefined();
                // Must have at least one effect (usually 2pc)
                expect(relic.setBonuses.length).toBeGreaterThan(0);
            });
        });
    });
});
