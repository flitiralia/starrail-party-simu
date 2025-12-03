import { ALL_CHARACTERS } from '../data/characters/index';
import { registry } from '../simulator/registry/index';

console.log('Checking ALL_CHARACTERS...');
const archarInList = ALL_CHARACTERS.find(c => c.id === 'archar');
if (archarInList) {
    console.log('SUCCESS: Archer found in ALL_CHARACTERS');
} else {
    console.error('FAILURE: Archer NOT found in ALL_CHARACTERS');
}

console.log('Checking Registry...');
const factory = registry.getCharacterFactory('archar');
if (factory) {
    console.log('SUCCESS: Archer handler factory found in registry');
} else {
    console.error('FAILURE: Archer handler factory NOT found in registry');
}
