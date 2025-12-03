export { march7th, march7thHandlerFactory } from './march-7th';
export { tribbie, tribbieHandlerFactory } from './tribbie';
export { kafka, kafkaHandlerFactory } from './kafka';
export { luochaHandlerFactory } from './luocha-handler';
export { luocha } from './luocha';
export { archar, archarHandlerFactory } from './archar';

// Export all characters for easy access
import { march7th } from './march-7th';
import { tribbie } from './tribbie';
import { kafka } from './kafka';
import { luocha } from './luocha';
import { archar } from './archar';

export const ALL_CHARACTERS = [march7th, tribbie, kafka, luocha, archar];