'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
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
} from '@/app/types';
import { runSimulation } from '@/app/simulator/engine/simulation'; // Added
import { calculateFinalStats } from '@/app/simulator/statBuilder';
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
const enemyList: Enemy[] = Object.values(enemies).filter((e: any) => e && typeof e === 'object' && 'baseStats' in e) as Enemy[];

const MAX_PARTY_SIZE = 4;

// Styles
const containerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  padding: '16px',
  gap: '24px',
  maxWidth: '1600px',
  margin: '0 auto',
};

const mainLayoutStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '300px 1fr 500px', // Widened right column
  gap: '24px',
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

export default function Home() {
  // --- PARTY STATE ---
  const [partyMembers, setPartyMembers] = useState<PartyMember[]>([]);
  const [activeCharacterIndex, setActiveCharacterIndex] = useState<number | null>(null);

  // --- ENEMY STATE ---
  const [weaknesses, setWeaknesses] = useState(new Set<Element>());
  const [enemyLevel, setEnemyLevel] = useState(80);
  const [enemyMaxHp, setEnemyMaxHp] = useState(10000);
  const [enemyToughness, setEnemyToughness] = useState(180);
  const [enemyAtk, setEnemyAtk] = useState<number | undefined>(undefined); // Optional, undefined = default
  const [enemyDef, setEnemyDef] = useState<number | undefined>(undefined); // Optional, undefined = default
  const [enemySpd, setEnemySpd] = useState(132); // Default Speed

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

    // if (!simulationWorker.current) {
    //   alert('シミュレーションワーカーが利用できません。');
    //   return;
    // }

    const enemyConfig: EnemyConfig = {
      level: enemyLevel,
      maxHp: enemyMaxHp,
      toughness: enemyToughness,

      spd: enemySpd,
      atk: enemyAtk,
      def: enemyDef,
    };

    const partyConfig: PartyConfig = {
      members: partyMembers,
    };

    // Direct Execution (Bypassing Worker)
    const config: SimulationConfig = {
      characters: partyMembers.map((m) => m.character),
      enemies: enemyList,
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

  return (
    <main>
      <h1 style={{ padding: '0 16px' }}>崩壊スターレイル パーティビルドシミュレーター</h1>

      <div style={containerStyle}>
        <div style={mainLayoutStyle}>
          {/* 左サイドバー: 共通設定 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={sectionStyle}>
              <h3>敵の弱点属性</h3>
              <div style={weaknessGridStyle}>
                {ELEMENTS.map((element) => (
                  <label key={element} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
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

            <div style={sectionStyle}>
              <h3>敵のステータス</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label>
                  レベル:
                  <input
                    type="number"
                    value={enemyLevel}
                    onChange={(e) => setEnemyLevel(Number(e.target.value))}
                    style={{ ...selectorStyle, marginLeft: '8px' }}
                  />
                </label>
                <label>
                  最大HP:
                  <input
                    type="number"
                    value={enemyMaxHp}
                    onChange={(e) => setEnemyMaxHp(Number(e.target.value))}
                    style={{ ...selectorStyle, marginLeft: '8px' }}
                  />
                </label>
                <label>
                  靭性値:
                  <input
                    type="number"
                    value={enemyToughness}
                    onChange={(e) => setEnemyToughness(Number(e.target.value))}
                    style={{ ...selectorStyle, marginLeft: '8px' }}
                  />
                </label>

                <label>
                  スピード:
                  <input
                    type="number"
                    value={enemySpd}
                    onChange={(e) => setEnemySpd(Number(e.target.value))}
                    style={{ ...selectorStyle, marginLeft: '8px' }}
                  />
                </label>
                <label>
                  攻撃力:
                  <input
                    type="number"
                    placeholder="デフォルト"
                    value={enemyAtk ?? ''}
                    onChange={(e) => setEnemyAtk(e.target.value === '' ? undefined : Number(e.target.value))}
                    style={{ ...selectorStyle, marginLeft: '8px' }}
                  />
                </label>
                <label>
                  防御力:
                  <input
                    type="number"
                    placeholder="デフォルト"
                    value={enemyDef ?? ''}
                    onChange={(e) => setEnemyDef(e.target.value === '' ? undefined : Number(e.target.value))}
                    style={{ ...selectorStyle, marginLeft: '8px' }}
                  />
                </label>
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
              <h2 style={{ margin: '0 0 16px 0' }}>パーティ編成</h2>
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
    </main >
  );
}
