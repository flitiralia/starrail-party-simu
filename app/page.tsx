'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Character,
  FinalStats,
  ILightConeData,
  IRelicData,
  IOrnamentData,
  RelicSet,
  OrnamentSet,
  Enemy,
  SimulationLogEntry,
  Element,
  ELEMENTS,
  SimulationWorkerMessage,
  SimulationWorkerResult,
  PartyMember,
  PartyConfig,
  CharacterRotationConfig,
  EnemyConfig,
  SimulationConfig, // Added
  BattleResult, // Added
  EnemyData, // Added
  EnemyMember, // Added
} from '@/app/types';
import { runSimulation } from '@/app/simulator/engine/simulation'; // Added
import { calculateFinalStats } from '@/app/simulator/statBuilder';
import { calculateEnemyStats, calculateEnemyDef } from '@/app/data/enemies'; // Added enemy calc import
import CharacterStatsDisplay from '@/app/components/CharacterStatsDisplay';
import SimulationLogTable from '@/app/components/SimulationLogTable';
import PartySlotCard from '@/app/components/PartySlotCard';
import CharacterConfigPanel from '@/app/components/CharacterConfigPanel';

// Data Imports
import { ALL_CHARACTERS } from '@/app/data/characters';
import * as lightCones from '@/app/data/light-cones';
import * as relicSets from '@/app/data/relics';
import * as ornamentSets from '@/app/data/ornaments';
import * as enemies from '@/app/data/enemies';
import { getCharacterDefaultConfig } from '@/app/data/defaultConfig';

// Data Lists
const characterList: Character[] = ALL_CHARACTERS;
const lightConeList: ILightConeData[] = Object.values(lightCones);
const relicSetList: RelicSet[] = Object.values(relicSets);
const ornamentSetList: OrnamentSet[] = Object.values(ornamentSets);
const enemyPresetList: EnemyData[] = enemies.ALL_ENEMIES;

const MAX_PARTY_SIZE = 4;

// Styles
const containerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  padding: '16px',
  gap: '24px',
  // maxWidth: '1600px', // 削除: 画面幅制限を解除
  // margin: '0 auto', // 削除: 左詰めにする
};

const mainLayoutStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '280px 1fr 420px', // 右カラムを500px->420pxに縮小、左も微調整
  gap: '16px', // gapを詰める
};

const sectionStyle: React.CSSProperties = {
  borderWidth: '1px',
  borderStyle: 'solid',
  borderColor: '#444',
  padding: '16px',
  borderRadius: '8px',
  backgroundColor: '#0d0d0d',
};

const partyGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, 1fr)',
  gap: '16px',
};

const selectorStyle: React.CSSProperties = {
  backgroundColor: 'black',
  color: 'white',
  borderWidth: '1px',
  borderStyle: 'solid',
  borderColor: '#555',
  borderRadius: '4px',
  padding: '6px',
  width: '100%',
};

const buttonStyle: React.CSSProperties = {
  backgroundColor: '#2a4a2a',
  borderWidth: '1px',
  borderStyle: 'solid',
  borderColor: '#3a6a3a',
  borderRadius: '4px',
  color: 'white',
  padding: '10px 16px',
  cursor: 'pointer',
  fontSize: '1em',
  fontWeight: 'bold',
  width: '100%',
};

const addButtonStyle: React.CSSProperties = {
  ...buttonStyle,
  backgroundColor: '#2a3a4a',
  borderColor: '#3a5a6a',
  borderStyle: 'dashed',
};

const weaknessGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, 1fr)',
  gap: '8px',
  marginTop: '8px',
};

// --- SAVE DATA TYPES ---
interface CharacterSaveData {
  id: string; // Character ID
  eidolon: number;
  lightCone?: {
    id: string;
    level: number;
    superimposition: number;
  };
  relics: {
    setId: string;
    type: string;
    level: number;
    mainStat: { stat: string; value: number };
    subStats: { stat: string; value: number }[];
  }[];
  ornaments: {
    setId: string;
    type: string;
    level: number;
    mainStat: { stat: string; value: number };
    subStats: { stat: string; value: number }[];
  }[];
  config: CharacterRotationConfig;
}

interface PartySaveData {
  version: string;
  members: CharacterSaveData[];
}

export default function Home() {
  // --- HYDRATION FIX ---
  const [mounted, setMounted] = useState(false);

  // --- PARTY STATE ---
  const [partyMembers, setPartyMembers] = useState<PartyMember[]>([]);
  const [activeCharacterIndex, setActiveCharacterIndex] = useState<number | null>(null);

  // --- IMPORT MODAL STATE ---
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importMode, setImportMode] = useState<'party' | 'character'>('party');
  const [importTargetIndex, setImportTargetIndex] = useState<number | null>(null);
  const [importValue, setImportValue] = useState('');

  // --- ENEMY STATE ---
  const [weaknesses, setWeaknesses] = useState(new Set<Element>());

  // クライアントサイドマウント後にフラグを立てる
  useEffect(() => {
    setMounted(true);
  }, []);


  // --- ENEMY LOGIC (Multi-Enemy Support) ---
  const [enemyMembers, setEnemyMembers] = useState<EnemyMember[]>([]);
  const [globalEnemyLevel, setGlobalEnemyLevel] = useState(95);
  // Mode selection
  const [enemyMode, setEnemyMode] = useState<'preset' | 'custom'>('preset');

  // Preset Mode State
  const [selectedPresetId, setSelectedPresetId] = useState<string>(enemyPresetList[0]?.id || '');

  // Custom Mode State
  const [customEnemyName, setCustomEnemyName] = useState('Custom Enemy');
  const [customEnemyHp, setCustomEnemyHp] = useState(500000);
  const [customEnemyToughness, setCustomEnemyToughness] = useState(120);
  const [customEnemySpd, setCustomEnemySpd] = useState(132);
  const [customEnemyAtk, setCustomEnemyAtk] = useState<number | undefined>(undefined);
  const [customEnemyDef, setCustomEnemyDef] = useState<number | undefined>(undefined);

  // Add Enemy Handler
  const handleAddEnemy = () => {
    if (enemyMembers.length >= 5) {
      alert('敵は最大5体までです。');
      return;
    }

    let newMember: EnemyMember;

    if (enemyMode === 'preset') {
      const enemyData = enemyPresetList.find(e => e.id === selectedPresetId);
      if (!enemyData) return;

      newMember = {
        id: Math.random().toString(36).slice(2) + Date.now().toString(36),
        enemyId: enemyData.id,
        level: globalEnemyLevel,
        isCustom: false,
      };
    } else {
      // Custom Mode
      newMember = {
        id: Math.random().toString(36).slice(2) + Date.now().toString(36),
        enemyId: 'custom',
        level: globalEnemyLevel,
        isCustom: true,
        customStats: {
          name: customEnemyName,
          hp: customEnemyHp,
          toughness: customEnemyToughness,
          spd: customEnemySpd,
          atk: customEnemyAtk,
          def: customEnemyDef,
        }
      };
    }

    setEnemyMembers([...enemyMembers, newMember]);
  };

  const handleRemoveEnemy = (index: number) => {
    const newMembers = [...enemyMembers];
    newMembers.splice(index, 1);
    setEnemyMembers(newMembers);
  };

  // 敵の順番を上に移動
  const handleMoveEnemyUp = (index: number) => {
    if (index <= 0) return; // 既に先頭
    const newMembers = [...enemyMembers];
    [newMembers[index - 1], newMembers[index]] = [newMembers[index], newMembers[index - 1]];
    setEnemyMembers(newMembers);
  };

  // 敵の順番を下に移動
  const handleMoveEnemyDown = (index: number) => {
    if (index >= enemyMembers.length - 1) return; // 既に末尾
    const newMembers = [...enemyMembers];
    [newMembers[index], newMembers[index + 1]] = [newMembers[index + 1], newMembers[index]];
    setEnemyMembers(newMembers);
  };

  // Initialize with one enemy if empty on mount (Optional, but good for UX)
  useEffect(() => {
    if (mounted && enemyMembers.length === 0 && enemyPresetList.length > 0) {
      const defaultEnemy = enemyPresetList.find(e => e.id === 'flamespawn') || enemyPresetList[0];
      setEnemyMembers([{
        id: Math.random().toString(36).slice(2) + Date.now().toString(36),
        enemyId: defaultEnemy.id,
        level: globalEnemyLevel
      }]);
    }
  }, [mounted]);

  // Deprecated States (kept for type compatibility if needed, but unused mainly)
  const [selectedEnemyId, setSelectedEnemyId] = useState<string>('');
  const [enemyLevel, setEnemyLevel] = useState(95);
  const [enemyMaxHp, setEnemyMaxHp] = useState(1000000);
  const [enemyToughness, setEnemyToughness] = useState(180);
  const [enemyAtk, setEnemyAtk] = useState<number | undefined>(undefined);
  const [enemyDef, setEnemyDef] = useState<number | undefined>(undefined);
  const [enemySpd, setEnemySpd] = useState(100);

  // --- ENEMY LOGIC ---
  // Update stats when Level or Selected Enemy changes (in Preset Mode)
  useEffect(() => {
    if (enemyMode === 'preset') {
      const selectedEnemy = enemyPresetList.find(e => e.id === selectedEnemyId);
      if (selectedEnemy) {
        // Calculate based on level
        const stats = calculateEnemyStats(selectedEnemy, enemyLevel);
        const def = calculateEnemyDef(enemyLevel);

        setEnemyMaxHp(stats.hp);
        setEnemyAtk(stats.atk);
        setEnemyDef(def);
        setEnemySpd(stats.spd);
        setEnemyToughness(selectedEnemy.toughness); // Toughness is usually static or has specific scaling, existing logic uses constant or data

        // Weaknesses are also updated
        setWeaknesses(new Set(selectedEnemy.weaknesses));
      }
    }
  }, [enemyMode, selectedEnemyId, enemyLevel]);

  // --- SIMULATION STATE ---
  const [rounds, setRounds] = useState(5);
  const [simulationLog, setSimulationLog] = useState<SimulationLogEntry[]>([]);
  const [finalStats, setFinalStats] = useState<Map<string, FinalStats>>(new Map());
  const [battleResult, setBattleResult] = useState<BattleResult | null>(null);

  // Web Worker (Disabled for debugging)
  // const simulationWorker = useRef<Worker | null>(null);

  // useEffect(() => {
  //   simulationWorker.current = new Worker(new URL('./workers/simulationWorker.ts', import.meta.url));

  //   simulationWorker.current.onmessage = (event: MessageEvent<SimulationWorkerResult>) => {
  //     if (event.data.type === 'SIMULATION_COMPLETE') {
  //       setSimulationLog(event.data.gameState.log);
  //     }
  //   };

  //   return () => {
  //     simulationWorker.current?.terminate();
  //   };
  // }, []);

  // --- PARTY MANAGEMENT ---
  const handleAddCharacter = () => {
    if (partyMembers.length >= MAX_PARTY_SIZE) return;

    const defaultChar = characterList[0]; // Default to first character
    const defaultRelics: IRelicData[] = [
      { type: 'Head', level: 15, mainStat: { stat: 'hp', value: 705 }, subStats: [], set: relicSetList[0] },
      { type: 'Hands', level: 15, mainStat: { stat: 'atk', value: 352 }, subStats: [], set: relicSetList[0] },
      { type: 'Body', level: 15, mainStat: { stat: 'def_pct', value: 0.54 }, subStats: [], set: relicSetList[0] },
      { type: 'Feet', level: 15, mainStat: { stat: 'spd', value: 25 }, subStats: [], set: relicSetList[0] },
    ];
    const defaultOrnaments: IOrnamentData[] = [
      { type: 'Planar Sphere', level: 15, mainStat: { stat: 'ice_dmg_boost', value: 0.388 }, subStats: [], set: ornamentSetList[0] },
      { type: 'Link Rope', level: 15, mainStat: { stat: 'energy_regen_rate', value: 0.194 }, subStats: [], set: ornamentSetList[0] },
    ];

    const newMember: PartyMember = {
      character: {
        ...defaultChar,
        relics: defaultRelics,
        ornaments: defaultOrnaments,
      },
      config: {
        rotation: ['s', 'b', 'b'],
        ultStrategy: 'immediate',
        ultCooldown: 0,
      },
      enabled: true,
      eidolonLevel: 0, // 初期値は無凸（0）
    };

    setPartyMembers([...partyMembers, newMember]);
    setActiveCharacterIndex(partyMembers.length);
  };

  const handleRemoveCharacter = (index: number) => {
    const newMembers = partyMembers.filter((_, i) => i !== index);
    setPartyMembers(newMembers);
    if (activeCharacterIndex === index) {
      setActiveCharacterIndex(null);
    } else if (activeCharacterIndex !== null && activeCharacterIndex > index) {
      setActiveCharacterIndex(activeCharacterIndex - 1);
    }

    // キャラクター削除時はシミュレーション結果をクリア
    setBattleResult(null);
    setSimulationLog([]);
  };

  // --- EXPORT / IMPORT ---
  const handleExportParty = () => {
    if (partyMembers.length === 0) {
      alert('エクスポートするパーティがいません。');
      return;
    }

    const saveData: PartySaveData = {
      version: '1.0',
      members: partyMembers.map(m => ({
        id: m.character.id,
        eidolon: m.eidolonLevel,
        lightCone: m.character.equippedLightCone ? {
          id: m.character.equippedLightCone.lightCone.id,
          level: m.character.equippedLightCone.level,
          superimposition: m.character.equippedLightCone.superimposition
        } : undefined,
        relics: (m.character.relics || []).map(r => ({
          setId: r.set.id,
          type: r.type,
          level: r.level,
          mainStat: r.mainStat,
          subStats: r.subStats
        })),
        ornaments: (m.character.ornaments || []).map(o => ({
          setId: o.set.id,
          type: o.type,
          level: o.level,
          mainStat: o.mainStat,
          subStats: o.subStats
        })),
        config: m.config
      }))
    };

    navigator.clipboard.writeText(JSON.stringify(saveData))
      .then(() => alert('パーティ情報をクリップボードにコピーしました。'))
      .catch(err => {
        console.error('Export failed:', err);
        alert('クリップボードへのコピーに失敗しました。');
      });
  };

  const handleImportParty = () => {
    setImportMode('party');
    setImportValue('');
    setIsImportModalOpen(true);
  };

  const executeImportParty = (input: string) => {
    if (!input) return;

    try {
      const data: PartySaveData = JSON.parse(input);
      if (!data.members || !Array.isArray(data.members)) {
        throw new Error('Invalid format');
      }

      const newMembers: PartyMember[] = data.members.map(saved => {
        const charBase = characterList.find(c => c.id === saved.id);
        if (!charBase) throw new Error(`キャラが見つかりません: ${saved.id}`);

        const lightCone = saved.lightCone ? {
          lightCone: lightConeList.find(lc => lc.id === saved.lightCone?.id)!,
          level: saved.lightCone.level,
          superimposition: saved.lightCone.superimposition as any
        } : undefined;

        const relics = saved.relics.map(r => {
          const set = relicSetList.find(s => s.id === r.setId);
          if (!set) throw new Error(`遺物セットが見つかりません: ${r.setId}`);
          return {
            type: r.type as any,
            level: r.level,
            mainStat: r.mainStat as any,
            subStats: r.subStats as any,
            set: set
          };
        });

        const ornaments = saved.ornaments.map(o => {
          const set = ornamentSetList.find(s => s.id === o.setId);
          if (!set) throw new Error(`オーナメントセットが見つかりません: ${o.setId}`);
          return {
            type: o.type as any,
            level: o.level,
            mainStat: o.mainStat as any,
            subStats: o.subStats as any,
            set: set
          };
        });

        return {
          character: {
            ...charBase,
            equippedLightCone: lightCone,
            relics: relics as any,
            ornaments: ornaments as any
          },
          config: saved.config,
          enabled: true,
          eidolonLevel: saved.eidolon
        };
      });

      setPartyMembers(newMembers);
      setActiveCharacterIndex(null);
      setBattleResult(null);
      setSimulationLog([]);
      setIsImportModalOpen(false);
      alert('パーティ情報をインポートしました。');
    } catch (e: any) {
      console.error(e);
      alert(`インポートに失敗しました: ${e.message}`);
    }
  };

  const handleExportCharacter = (index: number) => {
    const m = partyMembers[index];
    if (!m) return;

    const saveData: CharacterSaveData = {
      id: m.character.id,
      eidolon: m.eidolonLevel,
      lightCone: m.character.equippedLightCone ? {
        id: m.character.equippedLightCone.lightCone.id,
        level: m.character.equippedLightCone.level,
        superimposition: m.character.equippedLightCone.superimposition
      } : undefined,
      relics: (m.character.relics || []).map(r => ({
        setId: r.set.id,
        type: r.type,
        level: r.level,
        mainStat: r.mainStat,
        subStats: r.subStats
      })),
      ornaments: (m.character.ornaments || []).map(o => ({
        setId: o.set.id,
        type: o.type,
        level: o.level,
        mainStat: o.mainStat,
        subStats: o.subStats
      })),
      config: m.config
    };

    navigator.clipboard.writeText(JSON.stringify(saveData))
      .then(() => alert(`${m.character.name}の情報をクリップボードにコピーしました。`))
      .catch(err => {
        console.error('Export failed:', err);
        alert('クリップボードへのコピーに失敗しました。');
      });
  };

  const handleImportCharacter = (index: number) => {
    setImportMode('character');
    setImportTargetIndex(index);
    setImportValue('');
    setIsImportModalOpen(true);
  };

  const executeImportCharacter = (index: number, input: string) => {
    if (!input) return;

    try {
      const saved: CharacterSaveData = JSON.parse(input);
      if (!saved.id || !saved.relics) {
        throw new Error('Invalid character format');
      }

      const charBase = characterList.find(c => c.id === saved.id);
      if (!charBase) throw new Error(`キャラが見つかりません: ${saved.id}`);

      const lightCone = saved.lightCone ? {
        lightCone: lightConeList.find(lc => lc.id === saved.lightCone?.id)!,
        level: saved.lightCone.level,
        superimposition: saved.lightCone.superimposition as any
      } : undefined;

      const relics = saved.relics.map(r => {
        const set = relicSetList.find(s => s.id === r.setId);
        if (!set) throw new Error(`遺物セットが見つかりません: ${r.setId}`);
        return {
          type: r.type as any,
          level: r.level,
          mainStat: r.mainStat as any,
          subStats: r.subStats as any,
          set: set
        };
      });

      const ornaments = saved.ornaments.map(o => {
        const set = ornamentSetList.find(s => s.id === o.setId);
        if (!set) throw new Error(`オーナメントセットが見つかりません: ${o.setId}`);
        return {
          type: o.type as any,
          level: o.level,
          mainStat: o.mainStat as any,
          subStats: o.subStats as any,
          set: set
        };
      });

      const newMembers = [...partyMembers];
      newMembers[index] = {
        character: {
          ...charBase,
          equippedLightCone: lightCone,
          relics: relics as any,
          ornaments: ornaments as any
        },
        config: saved.config,
        enabled: true,
        eidolonLevel: saved.eidolon
      };

      setPartyMembers(newMembers);
      setBattleResult(null);
      setSimulationLog([]);
      setIsImportModalOpen(false);
      alert(`${charBase.name}の情報をインポートしました。`);
    } catch (e: any) {
      console.error(e);
      alert(`インポートに失敗しました: ${e.message}`);
    }
  };

  const handleCharacterSelect = (index: number, charId: string) => {
    const selectedChar = characterList.find((c) => c.id === charId);
    if (!selectedChar) return;

    const newMembers = [...partyMembers];
    let updatedCharacter: Character = {
      ...selectedChar,
      relics: newMembers[index].character.relics,
      ornaments: newMembers[index].character.ornaments,
      equippedLightCone: newMembers[index].character.equippedLightCone,
    };
    let updatedConfig = { ...newMembers[index].config };

    // デフォルト設定を適用（グローバルフォールバック付き）
    const defaultConfig = getCharacterDefaultConfig(selectedChar.defaultConfig);

    // 凸数を適用
    let updatedEidolonLevel = defaultConfig.eidolonLevel ?? 0;

    // 光円錐
    if (defaultConfig.lightConeId) {
      const lc = lightConeList.find(l => l.id === defaultConfig.lightConeId);
      if (lc) {
        updatedCharacter.equippedLightCone = {
          lightCone: lc,
          level: 80,
          superimposition: defaultConfig.superimposition || 1,
        };
      }
    }

    // 遺物セット
    if (defaultConfig.relicSetIds) {
      // 2セット+2セット構成
      const [setId1, setId2] = defaultConfig.relicSetIds;
      const relicSet1 = relicSetList.find(s => s.id === setId1);
      const relicSet2 = relicSetList.find(s => s.id === setId2);
      if (relicSet1 && relicSet2) {
        const mainStats = defaultConfig.mainStats || {};
        updatedCharacter.relics = [
          // 最初の2つはセット1
          { type: 'Head', level: 15, mainStat: { stat: 'hp', value: 705 }, subStats: [], set: relicSet1 },
          { type: 'Hands', level: 15, mainStat: { stat: 'atk', value: 352 }, subStats: [], set: relicSet1 },
          // 残り2つはセット2
          { type: 'Body', level: 15, mainStat: { stat: mainStats.body || 'hp_pct', value: getMainStatValue(mainStats.body || 'hp_pct') }, subStats: [], set: relicSet2 },
          { type: 'Feet', level: 15, mainStat: { stat: mainStats.feet || 'hp_pct', value: getMainStatValue(mainStats.feet || 'hp_pct') }, subStats: [], set: relicSet2 },
        ];
      }
    } else if (defaultConfig.relicSetId) {
      // 4セット構成
      const relicSet = relicSetList.find(s => s.id === defaultConfig.relicSetId);
      if (relicSet) {
        const mainStats = defaultConfig.mainStats || {};
        updatedCharacter.relics = [
          { type: 'Head', level: 15, mainStat: { stat: 'hp', value: 705 }, subStats: [], set: relicSet },
          { type: 'Hands', level: 15, mainStat: { stat: 'atk', value: 352 }, subStats: [], set: relicSet },
          { type: 'Body', level: 15, mainStat: { stat: mainStats.body || 'hp_pct', value: getMainStatValue(mainStats.body || 'hp_pct') }, subStats: [], set: relicSet },
          { type: 'Feet', level: 15, mainStat: { stat: mainStats.feet || 'hp_pct', value: getMainStatValue(mainStats.feet || 'hp_pct') }, subStats: [], set: relicSet },
        ];
      }
    }

    // オーナメントセット
    if (defaultConfig.ornamentSetId) {
      const ornamentSet = ornamentSetList.find(s => s.id === defaultConfig.ornamentSetId);
      if (ornamentSet) {
        const mainStats = defaultConfig.mainStats || {};
        updatedCharacter.ornaments = [
          { type: 'Planar Sphere', level: 15, mainStat: { stat: mainStats.sphere || 'hp_pct', value: getMainStatValue(mainStats.sphere || 'hp_pct') }, subStats: [], set: ornamentSet },
          { type: 'Link Rope', level: 15, mainStat: { stat: mainStats.rope || 'hp_pct', value: getMainStatValue(mainStats.rope || 'hp_pct') }, subStats: [], set: ornamentSet },
        ];
      }
    }

    // サブステータス（headの遺物に格納）
    if (defaultConfig.subStats && updatedCharacter.relics && updatedCharacter.relics.length > 0) {
      updatedCharacter.relics[0] = {
        ...updatedCharacter.relics[0],
        subStats: defaultConfig.subStats.map(s => ({ stat: s.stat, value: s.value })),
      };
    }

    // ローテーション（グローバルデフォルト込み）
    if (defaultConfig.rotation) {
      updatedConfig.rotation = defaultConfig.rotation;
    }

    // ローテーションモード
    if (defaultConfig.rotationMode) {
      updatedConfig.rotationMode = defaultConfig.rotationMode;
    }

    // スパムスキル発動SP閾値
    if (defaultConfig.spamSkillTriggerSp !== undefined) {
      updatedConfig.spamSkillTriggerSp = defaultConfig.spamSkillTriggerSp;
    }

    // 必殺技発動方針
    if (defaultConfig.ultStrategy) {
      updatedConfig.ultStrategy = defaultConfig.ultStrategy;
      updatedConfig.ultCooldown = defaultConfig.ultCooldown || 0;
    }

    newMembers[index] = {
      ...newMembers[index],
      character: updatedCharacter,
      config: updatedConfig,
      eidolonLevel: updatedEidolonLevel,
    };
    setPartyMembers(newMembers);

    // キャラクター変更時はシミュレーション結果をクリア
    setBattleResult(null);
    setSimulationLog([]);
  };

  // メインステータスの値を取得するヘルパー関数
  const getMainStatValue = (stat: string): number => {
    const values: Record<string, number> = {
      hp: 705, atk: 352, spd: 25,
      hp_pct: 0.432, atk_pct: 0.432, def_pct: 0.540,
      crit_rate: 0.324, crit_dmg: 0.648, break_effect: 0.648,
      heal_rate: 0.345, energy_regen_rate: 0.194, effect_hit_rate: 0.432,
      physical_dmg_boost: 0.388, fire_dmg_boost: 0.388, ice_dmg_boost: 0.388,
      lightning_dmg_boost: 0.388, wind_dmg_boost: 0.388, quantum_dmg_boost: 0.388, imaginary_dmg_boost: 0.388,
    };
    return values[stat] || 0;
  };

  const handleCharacterUpdate = (index: number, updatedCharacter: Character) => {
    const newMembers = [...partyMembers];
    newMembers[index] = {
      ...newMembers[index],
      character: updatedCharacter,
    };
    setPartyMembers(newMembers);
  };

  const handleConfigUpdate = (index: number, updatedConfig: CharacterRotationConfig) => {
    const newMembers = [...partyMembers];
    newMembers[index] = {
      ...newMembers[index],
      config: updatedConfig,
    };
    setPartyMembers(newMembers);
  };

  // --- SIMULATION ---
  const handleRunSimulation = () => {
    if (partyMembers.length === 0) {
      alert('パーティメンバーを追加してください。');
      return;
    }

    // Generate EnemyData list
    const targetEnemies: EnemyData[] = [];

    if (enemyMode === 'custom') {
      const customEnemy: EnemyData = {
        id: 'custom_enemy',
        name: customEnemyName || 'Custom Enemy',
        rank: 'Elite',
        hpMultiplier: 0,  // 未使用（isCustom時はoverride値を使用）
        atkMultiplier: 0, // 未使用
        baseSpd: customEnemySpd, // 未使用（isCustom時はoverride値を使用）
        toughness: customEnemyToughness,
        // Default to standard resistance
        elementalRes: {
          Physical: 0.2, Fire: 0.2, Ice: 0.2, Lightning: 0.2, Wind: 0.2, Quantum: 0.2, Imaginary: 0.2
        },
        baseEffectRes: 0,
        element: 'Physical',
        weaknesses: Array.from(weaknesses), // Use global weaknesses
        abilities: {
          basic: { id: 'basic', name: 'Attack', type: 'Basic ATK', targetType: 'single_enemy', description: 'Normal Attack' },
          skill: { id: 'skill', name: 'Skill', type: 'Skill', targetType: 'single_enemy', description: 'None' },
          ultimate: { id: 'ult', name: 'Ultimate', type: 'Ultimate', targetType: 'single_enemy', description: 'None' },
          talent: { id: 'talent', name: 'Talent', type: 'Talent', description: 'None' },
          technique: { id: 'tech', name: 'Technique', type: 'Technique', description: 'None' }
        },
        // ★ カスタム敵用オーバーライドフィールド ★
        isCustom: true,
        overrideHp: customEnemyHp,
        overrideSpd: customEnemySpd,
        overrideAtk: customEnemyAtk,
        overrideDef: customEnemyDef,
      };
      targetEnemies.push(customEnemy);
    } else {
      // Preset Mode: Use enemyMembers list
      if (enemyMembers.length === 0) {
        alert('敵を追加してください。');
        return;
      }

      const presetEnemies = enemyMembers.map(member => {
        const baseData = enemyPresetList.find(e => e.id === member.enemyId);
        if (!baseData) return null;
        return baseData;
      }).filter((e): e is EnemyData => e !== null);

      targetEnemies.push(...presetEnemies);

      if (targetEnemies.length === 0) {
        alert('有効な敵データが見つかりません。');
        return;
      }
    }

    const enemyConfig: EnemyConfig = {
      level: globalEnemyLevel,
      maxHp: 0,
      toughness: 0,
      spd: 0,
    };

    const partyConfig: PartyConfig = {
      members: partyMembers,
    };

    const config: SimulationConfig = {
      characters: partyMembers.map((m) => m.character),
      enemies: targetEnemies as any as Enemy[],
      weaknesses: weaknesses,
      enemyConfig: enemyConfig,
      partyConfig: partyConfig,
      rounds: rounds,
    };

    try {
      const finalState = runSimulation(config);
      setSimulationLog(finalState.log);
      setBattleResult(finalState.result);
    } catch (e) {
      console.error("Simulation failed:", e);
      alert("シミュレーション中にエラーが発生しました。コンソールを確認してください。");
    }
  };

  // Calculate stats for active character
  useEffect(() => {
    const newStatsMap = new Map<string, FinalStats>();
    partyMembers.forEach((member) => {
      const stats = calculateFinalStats(member.character);
      newStatsMap.set(member.character.id, stats);
    });
    setFinalStats(newStatsMap);
  }, [partyMembers]);

  const activeCharacter = activeCharacterIndex !== null ? partyMembers[activeCharacterIndex]?.character : null;
  const activeConfig = activeCharacterIndex !== null ? partyMembers[activeCharacterIndex]?.config : null;
  const activeStats = activeCharacter ? finalStats.get(activeCharacter.id) : null;

  // ハイドレーションエラー回避: クライアントマウント前はローディング表示
  if (!mounted) {
    return (
      <main suppressHydrationWarning>
        <h1 style={{ padding: '0 16px', textAlign: 'center' }} suppressHydrationWarning>崩壊スターレイル パーティビルドシミュレーター</h1>
        <div style={{ textAlign: 'center', padding: '40px', color: '#888' }} suppressHydrationWarning>読み込み中...</div>
      </main>
    );
  }

  return (
    <main>
      <h1 style={{ padding: '0 16px', textAlign: 'center' }}>崩壊スターレイル パーティビルドシミュレーター</h1>

      <div style={containerStyle}>
        <div style={mainLayoutStyle}>
          {/* 左サイドバー: 共通設定 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>


            <div style={sectionStyle}>
              <h3>敵の設定</h3>

              {/* Mode Selection */}

              {/* Global Enemy Level */}
              <div style={{ marginBottom: '16px' }}>
                <label>
                  敵レベル(全体):
                  <input
                    type="number"
                    value={globalEnemyLevel}
                    onChange={(e) => setGlobalEnemyLevel(Number(e.target.value))}
                    style={{ ...selectorStyle, marginLeft: '8px', width: '80px' }}
                  />
                </label>
              </div>

              {/* Mode Selection */}
              <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <input
                    type="radio"
                    checked={enemyMode === 'preset'}
                    onChange={() => setEnemyMode('preset')}
                  />
                  プリセット選択
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <input
                    type="radio"
                    checked={enemyMode === 'custom'}
                    onChange={() => setEnemyMode('custom')}
                  />
                  カスタム入力
                </label>
              </div>

              {/* Enemy List (Preset Mode Only) */}
              {enemyMode === 'preset' && (
                <div style={{ marginBottom: '16px', border: '1px solid #444', borderRadius: '4px', padding: '8px' }}>
                  <div style={{ fontWeight: 'bold', marginBottom: '8px', color: '#ccc' }}>現在の敵リスト ({enemyMembers.length}/5)</div>
                  {enemyMembers.length === 0 ? (
                    <div style={{ color: '#666', fontSize: '0.9em' }}>敵がいません</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {enemyMembers.map((member, index) => {
                        const data = enemyPresetList.find(e => e.id === member.enemyId);
                        return (
                          <div key={member.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#333', padding: '6px', borderRadius: '4px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              {/* 並び替えボタン */}
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                <button
                                  onClick={() => handleMoveEnemyUp(index)}
                                  disabled={index === 0}
                                  style={{
                                    backgroundColor: index === 0 ? '#444' : '#555',
                                    border: 'none',
                                    color: index === 0 ? '#666' : '#ccc',
                                    borderRadius: '2px',
                                    padding: '1px 4px',
                                    cursor: index === 0 ? 'not-allowed' : 'pointer',
                                    fontSize: '0.7em',
                                    lineHeight: 1,
                                  }}
                                >
                                  ▲
                                </button>
                                <button
                                  onClick={() => handleMoveEnemyDown(index)}
                                  disabled={index === enemyMembers.length - 1}
                                  style={{
                                    backgroundColor: index === enemyMembers.length - 1 ? '#444' : '#555',
                                    border: 'none',
                                    color: index === enemyMembers.length - 1 ? '#666' : '#ccc',
                                    borderRadius: '2px',
                                    padding: '1px 4px',
                                    cursor: index === enemyMembers.length - 1 ? 'not-allowed' : 'pointer',
                                    fontSize: '0.7em',
                                    lineHeight: 1,
                                  }}
                                >
                                  ▼
                                </button>
                              </div>
                              {/* 敵情報 */}
                              <div>
                                <div style={{ fontWeight: 'bold', fontSize: '0.9em' }}>{data?.name || member.enemyId}</div>
                                <div style={{ fontSize: '0.8em', color: '#aaa' }}>{data?.rank}</div>
                              </div>
                            </div>
                            <button
                              onClick={() => handleRemoveEnemy(index)}
                              style={{ backgroundColor: '#662222', border: 'none', color: '#ccc', borderRadius: '4px', padding: '2px 8px', cursor: 'pointer' }}
                            >
                              ✕
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}



              {/* Add Enemy Form or Custom Inputs */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {enemyMode === 'preset' ? (
                  /* Preset Mode UI */
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <select
                      value={selectedPresetId}
                      onChange={(e) => setSelectedPresetId(e.target.value)}
                      style={{ ...selectorStyle, width: '100%' }}
                    >
                      {enemyPresetList.map(enemy => (
                        <option key={enemy.id} value={enemy.id}>
                          {enemy.name}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={handleAddEnemy}
                      disabled={enemyMembers.length >= 5}
                      style={{ ...addButtonStyle, marginTop: 0, width: '100%', padding: '8px', fontSize: '0.9em' }}
                    >
                      + 追加
                    </button>
                  </div>
                ) : (
                  /* Custom Mode UI */
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <label style={{ fontSize: '0.9em', color: '#ccc' }}>カスタム敵設定 (単体)</label>
                    <input
                      type="text"
                      placeholder="敵の名前"
                      value={customEnemyName}
                      onChange={(e) => setCustomEnemyName(e.target.value)}
                      style={selectorStyle}
                    />
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <div style={{ flex: 1 }}>
                        <label style={{ fontSize: '0.8em' }}>HP</label>
                        <input type="number" value={customEnemyHp} onChange={(e) => setCustomEnemyHp(Number(e.target.value))} style={{ ...selectorStyle, width: '100%' }} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <label style={{ fontSize: '0.8em' }}>靭性</label>
                        <input type="number" value={customEnemyToughness} onChange={(e) => setCustomEnemyToughness(Number(e.target.value))} style={{ ...selectorStyle, width: '100%' }} />
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <div style={{ flex: 1 }}>
                        <label style={{ fontSize: '0.8em' }}>SPD</label>
                        <input type="number" value={customEnemySpd} onChange={(e) => setCustomEnemySpd(Number(e.target.value))} style={{ ...selectorStyle, width: '100%' }} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <label style={{ fontSize: '0.8em' }}>ATK</label>
                        <input type="number" placeholder="Default" value={customEnemyAtk ?? ''} onChange={(e) => setCustomEnemyAtk(e.target.value ? Number(e.target.value) : undefined)} style={{ ...selectorStyle, width: '100%' }} />
                      </div>
                    </div>

                    <div style={{ marginTop: '8px' }}>
                      <label style={{ fontSize: '0.8em', marginBottom: '4px', display: 'block' }}>弱点属性</label>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px' }}>
                        {ELEMENTS.map((element) => (
                          <label key={element} style={{ display: 'flex', alignItems: 'center', gap: '2px', fontSize: '0.8em' }}>
                            <input
                              type="checkbox"
                              checked={weaknesses.has(element)}
                              onChange={(e) => {
                                const newWeaknesses = new Set(weaknesses);
                                if (e.target.checked) {
                                  newWeaknesses.add(element);
                                } else {
                                  newWeaknesses.delete(element);
                                }
                                setWeaknesses(newWeaknesses);
                              }}
                            />
                            {element}
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div style={sectionStyle}>
              <h3>シミュレーション設定</h3>
              <label>
                ラウンド数:
                <input
                  type="number"
                  value={rounds}
                  onChange={(e) => setRounds(Number(e.target.value))}
                  style={{ ...selectorStyle, marginLeft: '8px' }}
                />
              </label>
            </div>

            <button style={buttonStyle} onClick={handleRunSimulation}>
              シミュレーション実行
            </button>
          </div>

          {/* 中央: パーティ編成 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={sectionStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h2 style={{ margin: 0 }}>パーティ編成</h2>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={handleExportParty}
                    style={{ ...buttonStyle, width: 'auto', padding: '4px 12px', fontSize: '0.85em', backgroundColor: '#34495e', borderColor: '#2c3e50' }}
                  >
                    エクスポート
                  </button>
                  <button
                    onClick={handleImportParty}
                    style={{ ...buttonStyle, width: 'auto', padding: '4px 12px', fontSize: '0.85em', backgroundColor: '#34495e', borderColor: '#2c3e50' }}
                  >
                    インポート
                  </button>
                </div>
              </div>
              <div style={partyGridStyle}>
                {Array.from({ length: MAX_PARTY_SIZE }).map((_, index) => {
                  const member = partyMembers[index];
                  return (
                    <PartySlotCard
                      key={index}
                      slotIndex={index}
                      character={member?.character || null}
                      characterList={characterList}
                      config={member?.config} // Pass config
                      onCharacterSelect={(charId) => handleCharacterSelect(index, charId)}
                      onRemove={() => handleRemoveCharacter(index)}
                      onConfigure={() => setActiveCharacterIndex(index)}
                      onConfigUpdate={(updatedConfig) => handleConfigUpdate(index, updatedConfig)} // Pass config update handler
                      isActive={activeCharacterIndex === index}
                      eidolonLevel={member?.eidolonLevel || 0}
                      // Pass simplified member list to each card for target selection
                      partyMembers={partyMembers.map((m, idx) => ({ id: m.character.id, name: m.character.name, slotIndex: idx }))}
                    // onEidolonChange removed from here, moved to ConfigPanel
                    />
                  );
                })}
              </div>

              {partyMembers.length < MAX_PARTY_SIZE && (
                <button style={{ ...addButtonStyle, marginTop: '16px' }} onClick={handleAddCharacter}>
                  + キャラクター追加
                </button>
              )}
            </div>

            {/* 戦闘結果サマリー */}
            {battleResult && (
              <div style={sectionStyle}>
                <h2>戦闘結果サマリー</h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ fontSize: '1.2em' }}>
                    <strong>合計与ダメージ: </strong>
                    <span style={{ color: '#ffcc00' }}>{Math.floor(battleResult.totalDamageDealt).toLocaleString()}</span>
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '8px' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #444', color: '#888' }}>
                        <th style={{ textAlign: 'left', padding: '8px' }}>キャラ</th>
                        <th style={{ textAlign: 'right', padding: '8px' }}>与ダメージ</th>
                        <th style={{ textAlign: 'right', padding: '8px' }}>与回復</th>
                        <th style={{ textAlign: 'right', padding: '8px' }}>与バリア</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(battleResult.characterStats).map(([charId, stats]) => {
                        const charName = partyMembers.find(m => m.character.id === charId)?.character.name || charId;
                        return (
                          <tr key={charId} style={{ borderBottom: '1px solid #333' }}>
                            <td style={{ padding: '8px' }}>{charName}</td>
                            <td style={{ textAlign: 'right', padding: '8px', color: stats.damageDealt > 0 ? '#ffaaaa' : 'inherit' }}>
                              {Math.floor(stats.damageDealt).toLocaleString()}
                            </td>
                            <td style={{ textAlign: 'right', padding: '8px', color: stats.healingDealt > 0 ? '#aaffaa' : 'inherit' }}>
                              {Math.floor(stats.healingDealt).toLocaleString()}
                            </td>
                            <td style={{ textAlign: 'right', padding: '8px', color: stats.shieldProvided > 0 ? '#aaaaff' : 'inherit' }}>
                              {Math.floor(stats.shieldProvided).toLocaleString()}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* シミュレーションログ */}
            <div style={sectionStyle}>
              <h2>シミュレーションログ</h2>
              <SimulationLogTable logs={simulationLog || []} />
            </div>
          </div>

          {/* 右サイドバー: 個別設定 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {activeCharacter && activeConfig && activeCharacterIndex !== null ? (
              <>
                {/* Stats Display Moved to Top */}
                {activeStats && (
                  <div style={sectionStyle}>
                    <h3>ステータス</h3>
                    <CharacterStatsDisplay
                      character={activeCharacter}
                      stats={activeStats}
                      currentHp={activeStats.hp}
                      currentShield={0}
                    />
                  </div>
                )}

                <CharacterConfigPanel
                  character={activeCharacter}
                  characterIndex={activeCharacterIndex}
                  lightConeList={lightConeList}
                  relicSetList={relicSetList}
                  ornamentSetList={ornamentSetList}
                  config={activeConfig}
                  eidolonLevel={partyMembers[activeCharacterIndex].eidolonLevel} // Pass Eidolon Level
                  onCharacterUpdate={(updatedChar) => handleCharacterUpdate(activeCharacterIndex, updatedChar)}
                  onConfigUpdate={(updatedConfig) => handleConfigUpdate(activeCharacterIndex, updatedConfig)}
                  onExport={() => handleExportCharacter(activeCharacterIndex)}
                  onImport={() => handleImportCharacter(activeCharacterIndex)}
                  onEidolonChange={(level) => { // Handle Eidolon Change
                    const newMembers = [...partyMembers];
                    newMembers[activeCharacterIndex] = {
                      ...newMembers[activeCharacterIndex],
                      eidolonLevel: level
                    };
                    setPartyMembers(newMembers);
                  }}
                />
              </>
            ) : (
              <div style={{ ...sectionStyle, textAlign: 'center', color: '#666' }}>
                キャラクタースロットを選択して設定してください
              </div>
            )}
          </div>
        </div>
      </div>

      {/* インポートモーダル */}
      {isImportModalOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000,
        }}>
          <div style={{
            ...sectionStyle,
            width: '600px',
            maxHeight: '80vh',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            boxShadow: '0 0 20px rgba(0,0,0,0.5)',
          }}>
            <h2 style={{ margin: 0 }}>
              {importMode === 'party' ? 'パーティ情報のインポート' : 'キャラクター情報のインポート'}
            </h2>
            <p style={{ margin: 0, fontSize: '0.9em', color: '#aaa' }}>
              エクスポートされたJSON文字列を以下に貼り付けてください。
            </p>
            <textarea
              value={importValue}
              onChange={(e) => setImportValue(e.target.value)}
              placeholder="JSONをここに入力..."
              style={{
                ...selectorStyle,
                height: '300px',
                fontFamily: 'monospace',
                fontSize: '0.85em',
                resize: 'none',
              }}
            />
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                style={{ ...buttonStyle, backgroundColor: '#444', borderColor: '#555' }}
                onClick={() => setIsImportModalOpen(false)}
              >
                キャンセル
              </button>
              <button
                style={buttonStyle}
                onClick={() => {
                  if (importMode === 'party') {
                    executeImportParty(importValue);
                  } else if (importMode === 'character' && importTargetIndex !== null) {
                    executeImportCharacter(importTargetIndex, importValue);
                  }
                }}
              >
                インポートを実行
              </button>
            </div>
          </div>
        </div>
      )}
    </main >
  );
}
