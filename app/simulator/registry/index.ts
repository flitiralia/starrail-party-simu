import { IEventHandlerFactory } from '../engine/types';
import { march7thHandlerFactory } from '../../data/characters/march-7th';
import { tribbieHandlerFactory } from '../../data/characters/tribbie';
import { kafkaHandlerFactory } from '../../data/characters/kafka';
import { luochaHandlerFactory } from '../../data/characters/luocha';
import { archarHandlerFactory } from '../../data/characters/archar';
import { danHengToukouHandlerFactory } from '../../data/characters/dan-heng-permansor-terrae';
import { hianshiHandlerFactory } from '../../data/characters/hianshi';
import { bladeHandlerFactory } from '../../data/characters/blade';
import { ruanMeiHandlerFactory } from '../../data/characters/ruan-mei';
import { sundayHandlerFactory } from '../../data/characters/sunday';
import { trailblazerRemembranceHandlerFactory } from '../../data/characters/trailblazer-remembrance';
import { trailblazerHarmonyHandlerFactory } from '../../data/characters/trailblazer-harmony';
import { hertaHandlerFactory } from '../../data/characters/herta';
import { acheronHandlerFactory } from '../../data/characters/acheron';
import { guinaifenHandlerFactory } from '../../data/characters/guinaifen';
import { blackSwanHandlerFactory } from '../../data/characters/black-swan';
import { cipherHandlerFactory } from '../../data/characters/cipher';
import { anaxaHandlerFactory } from '../../data/characters/anaxa';
import { bronyaHandlerFactory } from '../../data/characters/bronya';
import { evernightHandlerFactory } from '../../data/characters/evernight';
import { aglaeaHandlerFactory } from '../../data/characters/aglaea';
import { argentiHandlerFactory } from '../../data/characters/argenti';
import { aventurineHandlerFactory } from '../../data/characters/aventurine';
import { boothillHandlerFactory } from '../../data/characters/boothill';
import { castoriceHandlerFactory } from '../../data/characters/castorice';

type HandlerFactory = IEventHandlerFactory;

class Registry {
    private characterHandlers: Map<string, HandlerFactory> = new Map();
    private lightConeHandlers: Map<string, HandlerFactory> = new Map();
    private relicHandlers: Map<string, HandlerFactory> = new Map();

    // Character Registration
    registerCharacter(id: string, factory: HandlerFactory) {
        this.characterHandlers.set(id, factory);
    }

    getCharacterFactory(id: string): HandlerFactory | undefined {
        return this.characterHandlers.get(id);
    }

    // Light Cone Registration
    registerLightCone(id: string, factory: HandlerFactory) {
        this.lightConeHandlers.set(id, factory);
    }

    getLightConeFactory(id: string): HandlerFactory | undefined {
        return this.lightConeHandlers.get(id);
    }

    // Relic Registration
    registerRelic(id: string, factory: HandlerFactory) {
        this.relicHandlers.set(id, factory);
    }

    getRelicFactory(id: string): HandlerFactory | undefined {
        return this.relicHandlers.get(id);
    }
}

export const registry = new Registry();

// Register Characters
registry.registerCharacter('march-7th', march7thHandlerFactory);
registry.registerCharacter('tribbie', tribbieHandlerFactory);
registry.registerCharacter('kafka', kafkaHandlerFactory);
registry.registerCharacter('luocha', luochaHandlerFactory);
registry.registerCharacter('archar', archarHandlerFactory);
registry.registerCharacter('dan-heng-permansor-terrae', danHengToukouHandlerFactory);
registry.registerCharacter('hianshi', hianshiHandlerFactory);
registry.registerCharacter('blade', bladeHandlerFactory);
registry.registerCharacter('ruan-mei', ruanMeiHandlerFactory);
registry.registerCharacter('sunday', sundayHandlerFactory);
registry.registerCharacter('trailblazer-remembrance', trailblazerRemembranceHandlerFactory);
registry.registerCharacter('trailblazer-harmony', trailblazerHarmonyHandlerFactory);
registry.registerCharacter('herta', hertaHandlerFactory);
registry.registerCharacter('acheron', acheronHandlerFactory);
registry.registerCharacter('guinaifen', guinaifenHandlerFactory);
registry.registerCharacter('black-swan', blackSwanHandlerFactory);
registry.registerCharacter('cipher', cipherHandlerFactory);
registry.registerCharacter('anaxa', anaxaHandlerFactory);
registry.registerCharacter('bronya', bronyaHandlerFactory);
registry.registerCharacter('evernight', evernightHandlerFactory);
registry.registerCharacter('aglaea', aglaeaHandlerFactory);
registry.registerCharacter('argenti', argentiHandlerFactory);
registry.registerCharacter('aventurine', aventurineHandlerFactory);
registry.registerCharacter('boothill', boothillHandlerFactory);
registry.registerCharacter('castorice', castoriceHandlerFactory);

