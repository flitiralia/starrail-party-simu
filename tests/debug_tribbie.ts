import { tribbie } from '../app/data/characters/tribbie';
import { applyCharacterMechanics } from '../app/simulator/engine/gameState';

console.log('Starting debug script');
const unit = { ...tribbie, eidolonLevel: 4, abilities: JSON.parse(JSON.stringify(tribbie.abilities)) };
console.log('Calling applyCharacterMechanics');
const newUnit = applyCharacterMechanics(unit as any);
console.log('Modified Skill Effects:', JSON.stringify(newUnit.abilities.skill.effects, null, 2));
