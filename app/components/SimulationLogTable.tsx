'use client';

import React, { useState } from 'react';
import { SimulationLogEntry, HitDetail, AdditionalDamageEntry, HealingEntry, ShieldEntry, DotDetonationEntry, DamageTakenEntry, EquipmentEffectEntry, EffectSummary, ResourceChangeEntry } from '@/app/types';
import { getStatDisplayName } from '@/app/utils/statUtils';

interface SimulationLogTableProps {
  logs: SimulationLogEntry[];
}

const HitDetailsRow: React.FC<{ hitDetails: HitDetail[] }> = ({ hitDetails }) => {
  if (!hitDetails || hitDetails.length === 0) return null;

  // 係数名のマッピング
  const multiplierLabels: Record<string, string> = {
    baseDmg: '基礎ダメ',
    critMult: '会心系数',
    dmgBoostMult: '与ダメ係数',
    defMult: '防御係数',
    resMult: '耐性係数',
    vulnMult: '被ダメ係数',
    brokenMult: '撃破係数'
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 p-2 bg-gray-100 dark:bg-gray-900 rounded">
      {hitDetails.map((hit, idx) => (
        <div
          key={idx}
          className={`relative group flex items-center gap-2 px-2 py-1 rounded text-xs cursor-help ${hit.isCrit ? 'bg-yellow-200 dark:bg-yellow-800 border-l-4 border-yellow-500' : 'bg-gray-200 dark:bg-gray-700'
            }`}
        >
          <span className="font-semibold">Hit {hit.hitIndex + 1}:</span>
          <span className="text-gray-600 dark:text-gray-300">{(hit.multiplier * 100).toFixed(0)}%</span>
          <span className="font-bold">{Math.round(hit.damage)}</span>
          {hit.isCrit ? (
            <span className="text-yellow-600 dark:text-yellow-400 font-bold">✓ 会心</span>
          ) : (
            <span className="text-gray-400">-</span>
          )}
          {hit.targetName && <span className="text-gray-500 text-xs">({hit.targetName})</span>}

          {/* ダメージ係数ツールチップ */}
          {hit.breakdownMultipliers && (
            <div className="absolute z-50 bottom-full left-0 mb-1 hidden group-hover:block">
              <div className="bg-gray-800 dark:bg-gray-950 text-white text-xs p-2 rounded shadow-lg border border-gray-600 min-w-[200px]">
                <div className="font-semibold mb-1 text-yellow-400">📊 ダメージ計算式</div>
                <div className="space-y-0.5">
                  {Object.entries(hit.breakdownMultipliers).map(([key, value]) => (
                    <div key={key} className="flex justify-between">
                      <span className="text-gray-300">{multiplierLabels[key] || key}:</span>
                      <span className="font-mono">
                        {key === 'baseDmg'
                          ? Math.round(value as number).toLocaleString()
                          : (value as number).toFixed(4)
                        }
                      </span>
                    </div>
                  ))}
                </div>
                <div className="border-t border-gray-600 mt-1 pt-1 flex justify-between font-bold">
                  <span>最終ダメージ:</span>
                  <span className="text-green-400">{Math.round(hit.damage).toLocaleString()}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

// 統一アクション詳細コンポーネント（与ダメージ + 被ダメージ + 回復 + シールド）
const UnifiedActionDetails: React.FC<{
  primaryDamage?: { hitDetails: HitDetail[]; totalDamage: number };
  additionalDamage?: AdditionalDamageEntry[];
  damageTaken?: DamageTakenEntry[];
  healing?: HealingEntry[];
  shields?: ShieldEntry[];
}> = ({ primaryDamage, additionalDamage, damageTaken, healing, shields }) => {
  // 与ダメージのデータがあるかどうか
  const hasDamageDealt = (primaryDamage?.hitDetails && primaryDamage.hitDetails.length > 0) ||
    (additionalDamage && additionalDamage.length > 0);
  // 被ダメージのデータがあるかどうか
  const hasDamageTaken = damageTaken && damageTaken.length > 0;
  // 回復のデータがあるかどうか
  const hasHealing = healing && healing.length > 0;
  // シールドのデータがあるかどうか
  const hasShields = shields && shields.length > 0;

  // どれかデータがあればtrue
  const hasData = hasDamageDealt || hasDamageTaken || hasHealing || hasShields;
  if (!hasData) return null;

  // 係数名のマッピング
  const multiplierLabels: Record<string, string> = {
    baseDmg: '基礎ダメ',
    critMult: '会心系数',
    dmgBoostMult: '与ダメ係数',
    defMult: '防御係数',
    resMult: '耐性係数',
    vulnMult: '被ダメ係数',
    brokenMult: '撃破係数'
  };

  // 与ダメージ合計計算
  const primaryTotal = primaryDamage?.totalDamage || 0;
  const additionalTotal = additionalDamage?.reduce((sum, e) => sum + e.damage, 0) || 0;
  const damageDealtTotal = primaryTotal + additionalTotal;

  // 被ダメージ合計計算
  const damageTakenTotal = damageTaken?.reduce((sum, e) => sum + e.damage, 0) || 0;

  // 回復合計計算
  const healingTotal = healing?.reduce((sum, e) => sum + e.amount, 0) || 0;

  // シールド合計計算
  const shieldsTotal = shields?.reduce((sum, e) => sum + e.amount, 0) || 0;

  return (
    <div className="space-y-3">
      <div className="text-xs font-semibold text-gray-600 dark:text-gray-300">
        アクション詳細
      </div>

      {/* 与ダメージセクション */}
      {hasDamageDealt && (
        <div className="space-y-1">
          <div className="text-xs font-semibold text-red-600 dark:text-red-400">
            与ダメージ (合計: {Math.round(damageDealtTotal).toLocaleString()})
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 p-2 bg-gray-100 dark:bg-gray-900 rounded">
            {/* メインダメージのヒット */}
            {primaryDamage?.hitDetails.map((hit, idx) => (
              <div
                key={`hit-${idx}`}
                className={`relative group flex items-center gap-2 px-2 py-1 rounded text-xs cursor-help ${hit.isCrit ? 'bg-yellow-200 dark:bg-yellow-800 border-l-4 border-yellow-500' : 'bg-gray-200 dark:bg-gray-700'
                  }`}
              >
                <span className="font-semibold">Hit {hit.hitIndex + 1}:</span>
                <span className="text-gray-600 dark:text-gray-300">{(hit.multiplier * 100).toFixed(0)}%</span>
                <span className="font-bold">{Math.round(hit.damage)}</span>
                {hit.isCrit ? (
                  <span className="text-yellow-600 dark:text-yellow-400 font-bold">✓ 会心</span>
                ) : (
                  <span className="text-gray-400">-</span>
                )}
                {hit.targetName && <span className="text-gray-500 text-xs">({hit.targetName})</span>}

                {/* ダメージ係数ツールチップ */}
                {hit.breakdownMultipliers && (
                  <div className="absolute z-50 bottom-full left-0 mb-1 hidden group-hover:block">
                    <div className="bg-gray-800 dark:bg-gray-950 text-white text-xs p-2 rounded shadow-lg border border-gray-600 min-w-[200px]">
                      <div className="font-semibold mb-1 text-yellow-400">📊 ダメージ計算式</div>
                      <div className="space-y-0.5">
                        {Object.entries(hit.breakdownMultipliers).map(([key, value]) => (
                          <div key={key} className="flex justify-between">
                            <span className="text-gray-300">{multiplierLabels[key] || key}:</span>
                            <span className="font-mono">
                              {key === 'baseDmg'
                                ? Math.round(value as number).toLocaleString()
                                : (value as number).toFixed(4)
                              }
                            </span>
                          </div>
                        ))}
                      </div>
                      <div className="border-t border-gray-600 mt-1 pt-1 flex justify-between font-bold">
                        <span>最終ダメージ:</span>
                        <span className="text-green-400">{Math.round(hit.damage).toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {/* 付加ダメージ */}
            {additionalDamage?.map((entry, idx) => {
              // ダメージ種別に基づくラベルと色
              const getDamageTypeLabel = (type?: string) => {
                switch (type) {
                  case 'normal': return { label: '', color: 'text-gray-600 dark:text-gray-300', bg: 'bg-gray-200 dark:bg-gray-700' };
                  case 'break': return { label: '[撃破]', color: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-100 dark:bg-orange-900/50 border-orange-400' };
                  case 'break_additional': return { label: '[撃破付加]', color: 'text-red-600 dark:text-red-400', bg: 'bg-red-100 dark:bg-red-900/50 border-red-400' };
                  case 'super_break': return { label: '[超撃破]', color: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-100 dark:bg-purple-900/50 border-purple-400' };
                  case 'dot': return { label: '[DoT]', color: 'text-green-600 dark:text-green-400', bg: 'bg-green-100 dark:bg-green-900/50 border-green-400' };
                  case 'true_damage': return { label: '[確定]', color: 'text-pink-600 dark:text-pink-400', bg: 'bg-pink-100 dark:bg-pink-900/50 border-pink-400' };
                  case 'additional':
                  default: return { label: '[付加]', color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-100 dark:bg-blue-900/50 border-blue-400' };
                }
              };
              const typeInfo = getDamageTypeLabel(entry.damageType);

              return (
                <div
                  key={`add-${idx}`}
                  className={`relative group flex items-center gap-2 px-2 py-1 rounded text-xs cursor-help ${entry.isCrit ? `bg-opacity-50 border-l-4` : `border-l-2`
                    } ${typeInfo.bg}`}
                >
                  <span className={`font-semibold ${typeInfo.color}`}>{typeInfo.label}</span>
                  <span className="text-gray-600 dark:text-gray-300 truncate max-w-[80px]" title={`${entry.source}: ${entry.name}`}>
                    {entry.name}
                  </span>
                  <span className="font-bold">{Math.round(entry.damage)}</span>
                  {entry.isCrit && (
                    <span className="text-yellow-600 dark:text-yellow-400 font-bold">✓</span>
                  )}
                  <span className="text-gray-500 text-xs truncate">({entry.target})</span>

                  {/* ダメージ係数ツールチップ（付加ダメージ用） */}
                  {entry.breakdownMultipliers ? (
                    <div className="absolute z-50 bottom-full left-0 mb-1 hidden group-hover:block">
                      <div className="bg-gray-800 dark:bg-gray-950 text-white text-xs p-2 rounded shadow-lg border border-gray-600 min-w-[200px]">
                        <div className="font-semibold mb-1 text-blue-400">📊 {entry.source}: {entry.name}</div>
                        <div className="space-y-0.5">
                          {Object.entries(entry.breakdownMultipliers).map(([key, value]) => (
                            <div key={key} className="flex justify-between">
                              <span className="text-gray-300">{multiplierLabels[key] || key}:</span>
                              <span className="font-mono">
                                {key === 'baseDmg'
                                  ? Math.round(value as number).toLocaleString()
                                  : (value as number).toFixed(4)
                                }
                              </span>
                            </div>
                          ))}
                        </div>
                        <div className="border-t border-gray-600 mt-1 pt-1 flex justify-between font-bold">
                          <span>最終ダメージ:</span>
                          <span className="text-green-400">{Math.round(entry.damage).toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="absolute z-50 bottom-full left-0 mb-1 hidden group-hover:block">
                      <div className="bg-gray-800 dark:bg-gray-950 text-white text-xs p-2 rounded shadow-lg border border-gray-600">
                        <div className="font-semibold text-blue-400">{entry.source}: {entry.name}</div>
                        <div className="text-gray-300">ダメージ: {Math.round(entry.damage).toLocaleString()}</div>
                        <div className="text-gray-400">→ {entry.target}</div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 被ダメージセクション */}
      {hasDamageTaken && (
        <div className="space-y-1">
          <div className="text-xs font-semibold text-orange-600 dark:text-orange-400">
            被ダメージ (合計: {Math.round(damageTakenTotal).toLocaleString()})
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 p-2 bg-gray-100 dark:bg-gray-900 rounded">
            {damageTaken?.map((entry, idx) => {
              const getTypeLabel = (type: string) => {
                switch (type) {
                  case 'self': return { label: '[自傷]', color: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-100 dark:bg-purple-900/50 border-purple-400' };
                  case 'dot': return { label: `[${entry.dotType || 'DoT'}]`, color: 'text-green-600 dark:text-green-400', bg: 'bg-green-100 dark:bg-green-900/50 border-green-400' };
                  case 'enemy':
                  default: return { label: '[敵]', color: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-100 dark:bg-orange-900/50 border-orange-400' };
                }
              };
              const typeInfo = getTypeLabel(entry.type);

              return (
                <div
                  key={`taken-${idx}`}
                  className={`relative group flex items-center gap-2 px-2 py-1 rounded text-xs cursor-help border-l-2 ${typeInfo.bg}`}
                >
                  <span className={`font-semibold ${typeInfo.color}`}>{typeInfo.label}</span>
                  <span className="text-gray-600 dark:text-gray-300 truncate max-w-[100px]">
                    {entry.source}
                  </span>
                  <span className="font-bold text-orange-500">-{Math.round(entry.damage)}</span>

                  {/* ダメージ係数ツールチップ（被ダメージ用） */}
                  {entry.breakdownMultipliers && (
                    <div className="absolute z-50 bottom-full left-0 mb-1 hidden group-hover:block">
                      <div className="bg-gray-800 dark:bg-gray-950 text-white text-xs p-2 rounded shadow-lg border border-gray-600 min-w-[200px]">
                        <div className="font-semibold mb-1 text-orange-400">📊 被ダメージ計算式</div>
                        <div className="space-y-0.5">
                          {Object.entries(entry.breakdownMultipliers).map(([key, value]) => (
                            <div key={key} className="flex justify-between">
                              <span className="text-gray-300">{multiplierLabels[key] || key}:</span>
                              <span className="font-mono">
                                {key === 'baseDmg'
                                  ? Math.round(value as number).toLocaleString()
                                  : (value as number).toFixed(4)
                                }
                              </span>
                            </div>
                          ))}
                        </div>
                        <div className="border-t border-gray-600 mt-1 pt-1 flex justify-between font-bold">
                          <span>最終被ダメージ:</span>
                          <span className="text-orange-400">{Math.round(entry.damage).toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* HP消費計算式ツールチップ */}
                  {entry.hpConsumeBreakdown && (
                    <div className="absolute z-50 bottom-full left-0 mb-1 hidden group-hover:block">
                      <div className="bg-gray-800 dark:bg-gray-950 text-white text-xs p-2 rounded shadow-lg border border-gray-600 min-w-[220px]">
                        <div className="font-semibold mb-1 text-purple-400">📊 HP消費計算式</div>
                        <div className="space-y-0.5">
                          <div className="flex justify-between">
                            <span className="text-gray-300">最大HP:</span>
                            <span className="font-mono">{Math.round(entry.hpConsumeBreakdown.maxHp).toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-300">消費割合:</span>
                            <span className="font-mono">{(entry.hpConsumeBreakdown.consumeRatio * 100).toFixed(0)}%</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-300">想定コスト:</span>
                            <span className="font-mono">{Math.round(entry.hpConsumeBreakdown.expectedCost).toLocaleString()}</span>
                          </div>
                          <div className="border-t border-gray-600 mt-1 pt-1">
                            <div className="flex justify-between">
                              <span className="text-gray-300">消費前HP:</span>
                              <span className="font-mono">{Math.round(entry.hpConsumeBreakdown.hpBefore).toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-300">消費後HP:</span>
                              <span className="font-mono">{Math.round(entry.hpConsumeBreakdown.hpAfter).toLocaleString()}</span>
                            </div>
                          </div>
                        </div>
                        <div className="border-t border-gray-600 mt-1 pt-1 flex justify-between font-bold">
                          <span>実際の消費量:</span>
                          <span className="text-purple-400">-{Math.round(entry.hpConsumeBreakdown.actualConsumed).toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 回復セクション */}
      {hasHealing && (
        <div className="space-y-1">
          <div className="text-xs font-semibold text-green-600 dark:text-green-400">
            回復 (合計: {Math.round(healingTotal).toLocaleString()})
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 p-2 bg-gray-100 dark:bg-gray-900 rounded">
            {healing?.map((entry, idx) => (
              <div
                key={`heal-${idx}`}
                className="relative group flex items-center gap-2 px-2 py-1 bg-green-100 dark:bg-green-900/50 rounded text-xs border-l-2 border-green-400 cursor-help"
              >
                <span className="text-green-600 dark:text-green-400 font-semibold">[回復]</span>
                <span className="text-gray-600 dark:text-gray-300 truncate max-w-[80px]" title={`${entry.source}: ${entry.name}`}>
                  {entry.name}
                </span>
                <span className="font-bold text-green-500">+{Math.round(entry.amount)}</span>
                <span className="text-gray-500 text-xs truncate">→ {entry.target}</span>

                {/* 回復計算式ツールチップ */}
                {entry.breakdownMultipliers && (
                  <div className="absolute z-50 bottom-full left-0 mb-1 hidden group-hover:block">
                    <div className="bg-gray-800 dark:bg-gray-950 text-white text-xs p-2 rounded shadow-lg border border-gray-600 min-w-[200px]">
                      <div className="font-semibold mb-1 text-green-400">📊 回復計算式</div>
                      <div className="space-y-0.5">
                        {entry.breakdownMultipliers.scalingStat && (
                          <div className="flex justify-between">
                            <span className="text-gray-300">参照ステータス:</span>
                            <span className="font-mono">{entry.breakdownMultipliers.scalingStat}</span>
                          </div>
                        )}
                        {entry.breakdownMultipliers.multiplier !== undefined && (
                          <div className="flex justify-between">
                            <span className="text-gray-300">倍率:</span>
                            <span className="font-mono">{(entry.breakdownMultipliers.multiplier * 100).toFixed(1)}%</span>
                          </div>
                        )}
                        {entry.breakdownMultipliers.flat !== undefined && entry.breakdownMultipliers.flat > 0 && (
                          <div className="flex justify-between">
                            <span className="text-gray-300">固定値:</span>
                            <span className="font-mono">+{Math.round(entry.breakdownMultipliers.flat)}</span>
                          </div>
                        )}
                        <div className="flex justify-between">
                          <span className="text-gray-300">基礎回復量:</span>
                          <span className="font-mono">{Math.round(entry.breakdownMultipliers.baseHeal).toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-300">与回復バフ:</span>
                          <span className="font-mono">{(entry.breakdownMultipliers.outgoingHealBoost * 100).toFixed(1)}%</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-300">受回復バフ:</span>
                          <span className="font-mono">{(entry.breakdownMultipliers.incomingHealBoost * 100).toFixed(1)}%</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-300">回復係数:</span>
                          <span className="font-mono">{entry.breakdownMultipliers.healBoostMult.toFixed(4)}</span>
                        </div>
                      </div>
                      <div className="border-t border-gray-600 mt-1 pt-1 flex justify-between font-bold">
                        <span>最終回復量:</span>
                        <span className="text-green-400">+{Math.round(entry.amount).toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* シールドセクション */}
      {hasShields && (
        <div className="space-y-1">
          <div className="text-xs font-semibold text-purple-600 dark:text-purple-400">
            シールド (合計: {Math.round(shieldsTotal).toLocaleString()})
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 p-2 bg-gray-100 dark:bg-gray-900 rounded">
            {shields?.map((entry, idx) => (
              <div
                key={`shield-${idx}`}
                className="relative group flex items-center gap-2 px-2 py-1 bg-purple-100 dark:bg-purple-900/50 rounded text-xs border-l-2 border-purple-400 cursor-help"
              >
                <span className="text-purple-600 dark:text-purple-400 font-semibold">[シールド]</span>
                <span className="text-gray-600 dark:text-gray-300 truncate max-w-[80px]" title={`${entry.source}: ${entry.name}`}>
                  {entry.name}
                </span>
                <span className="font-bold text-purple-500">{Math.round(entry.amount)}</span>
                <span className="text-gray-500 text-xs truncate">→ {entry.target}</span>

                {/* シールド計算式ツールチップ */}
                {entry.breakdownMultipliers && (
                  <div className="absolute z-50 bottom-full left-0 mb-1 hidden group-hover:block">
                    <div className="bg-gray-800 dark:bg-gray-950 text-white text-xs p-2 rounded shadow-lg border border-gray-600 min-w-[200px]">
                      <div className="font-semibold mb-1 text-purple-400">📊 シールド計算式</div>
                      <div className="space-y-0.5">
                        {entry.breakdownMultipliers.scalingStat && (
                          <div className="flex justify-between">
                            <span className="text-gray-300">参照ステータス:</span>
                            <span className="font-mono">{entry.breakdownMultipliers.scalingStat}</span>
                          </div>
                        )}
                        {entry.breakdownMultipliers.multiplier !== undefined && (
                          <div className="flex justify-between">
                            <span className="text-gray-300">倍率:</span>
                            <span className="font-mono">{(entry.breakdownMultipliers.multiplier * 100).toFixed(1)}%</span>
                          </div>
                        )}
                        {entry.breakdownMultipliers.flat !== undefined && entry.breakdownMultipliers.flat > 0 && (
                          <div className="flex justify-between">
                            <span className="text-gray-300">固定値:</span>
                            <span className="font-mono">+{Math.round(entry.breakdownMultipliers.flat)}</span>
                          </div>
                        )}
                        <div className="flex justify-between">
                          <span className="text-gray-300">基礎シールド:</span>
                          <span className="font-mono">{Math.round(entry.breakdownMultipliers.baseShield).toLocaleString()}</span>
                        </div>
                        {entry.breakdownMultipliers.cap !== undefined && (
                          <div className="flex justify-between">
                            <span className="text-gray-300">上限値:</span>
                            <span className="font-mono">{Math.round(entry.breakdownMultipliers.cap).toLocaleString()}</span>
                          </div>
                        )}
                      </div>
                      <div className="border-t border-gray-600 mt-1 pt-1 flex justify-between font-bold">
                        <span>最終シールド:</span>
                        <span className="text-purple-400">{Math.round(entry.amount).toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// 付加ダメージ詳細コンポーネント（後方互換性のため残す）
const AdditionalDamageDetails: React.FC<{ entries: AdditionalDamageEntry[] }> = ({ entries }) => {
  if (!entries || entries.length === 0) return null;

  return (
    <div className="space-y-1">
      <div className="text-xs font-semibold text-blue-600 dark:text-blue-400">付加ダメージ:</div>
      {entries.map((entry, idx) => (
        <div key={idx} className="flex items-center gap-2 px-2 py-1 bg-blue-50 dark:bg-blue-900/30 rounded text-xs border-l-2 border-blue-400">
          <span className="text-blue-600 dark:text-blue-400">[{entry.source}]</span>
          <span>{entry.name}</span>
          <span className="font-bold text-red-500">{Math.round(entry.damage)}</span>
          {entry.isCrit && <span className="text-yellow-600 dark:text-yellow-400 font-bold">✓ 会心</span>}
          <span className="text-gray-500">→ {entry.target}</span>
        </div>
      ))}
    </div>
  );
};

// 回復詳細コンポーネント
const HealingDetails: React.FC<{ entries: HealingEntry[] }> = ({ entries }) => {
  if (!entries || entries.length === 0) return null;

  return (
    <div className="space-y-1">
      <div className="text-xs font-semibold text-green-600 dark:text-green-400">回復:</div>
      {entries.map((entry, idx) => (
        <div key={idx} className="flex items-center gap-2 px-2 py-1 bg-green-50 dark:bg-green-900/30 rounded text-xs border-l-2 border-green-400">
          <span className="text-green-600 dark:text-green-400">[{entry.source}]</span>
          <span>{entry.name}</span>
          <span className="font-bold text-green-500">+{Math.round(entry.amount)}</span>
          <span className="text-gray-500">→ {entry.target}</span>
        </div>
      ))}
    </div>
  );
};

// シールド詳細コンポーネント
const ShieldDetails: React.FC<{ entries: ShieldEntry[] }> = ({ entries }) => {
  if (!entries || entries.length === 0) return null;

  return (
    <div className="space-y-1">
      <div className="text-xs font-semibold text-purple-600 dark:text-purple-400">シールド:</div>
      {entries.map((entry, idx) => (
        <div key={idx} className="flex items-center gap-2 px-2 py-1 bg-purple-50 dark:bg-purple-900/30 rounded text-xs border-l-2 border-purple-400">
          <span className="text-purple-600 dark:text-purple-400">[{entry.source}]</span>
          <span>{entry.name}</span>
          <span className="font-bold text-purple-500">{Math.round(entry.amount)}</span>
          <span className="text-gray-500">→ {entry.target}</span>
        </div>
      ))}
    </div>
  );
};

// 被ダメ詳細コンポーネント
const DamageTakenDetails: React.FC<{ entries: DamageTakenEntry[] }> = ({ entries }) => {
  if (!entries || entries.length === 0) return null;

  const getBreakdownTooltip = (entry: DamageTakenEntry) => {
    if (!entry.breakdownMultipliers) return undefined;
    const m = entry.breakdownMultipliers;
    return `基礎ダメージ: ${m.baseDmg.toFixed(2)}
与ダメ倍率: ${m.dmgBoostMult.toFixed(3)}
防御補正: ${m.defMult.toFixed(3)}
耐性補正: ${m.resMult.toFixed(3)}
脆弱倍率: ${m.vulnMult.toFixed(3)}
撃破倍率: ${m.brokenMult.toFixed(3)}`;
  };

  return (
    <div className="space-y-1">
      <div className="text-xs font-semibold text-orange-600 dark:text-orange-400">被ダメ:</div>
      {entries.map((entry, idx) => (
        <div
          key={idx}
          className="flex items-center gap-2 px-2 py-1 bg-orange-50 dark:bg-orange-900/30 rounded text-xs border-l-2 border-orange-400"
          title={getBreakdownTooltip(entry)}
        >
          <span className="text-orange-600 dark:text-orange-400">[{entry.source}]</span>
          <span>{entry.type === 'self' ? '自傷' : entry.type === 'dot' ? entry.dotType || 'DoT' : '敵'}</span>
          <span className="font-bold text-orange-500">{Math.round(entry.damage)}</span>
          {entry.breakdownMultipliers && <span className="text-gray-400">📊</span>}
        </div>
      ))}
    </div>
  );
};


// 装備効果詳細コンポーネント
const EquipmentEffectDetails: React.FC<{ entries: EquipmentEffectEntry[] }> = ({ entries }) => {
  if (!entries || entries.length === 0) return null;

  const typeIcon = (type: string) => {
    switch (type) {
      case 'lightcone': return '💎';
      case 'relic': return '🏛️';
      case 'ornament': return '🔮';
      default: return '⚡';
    }
  };

  return (
    <div className="space-y-1">
      <div className="text-xs font-semibold text-cyan-600 dark:text-cyan-400">装備効果:</div>
      {entries.map((entry, idx) => (
        <div key={idx} className="flex items-center gap-2 px-2 py-1 bg-cyan-50 dark:bg-cyan-900/30 rounded text-xs border-l-2 border-cyan-400">
          <span>{typeIcon(entry.type)}</span>
          <span className="text-cyan-600 dark:text-cyan-400">[{entry.source}]</span>
          <span>{entry.name}</span>
          {entry.target && <span className="text-gray-500">→ {entry.target}</span>}
        </div>
      ))}
    </div>
  );
};

// リソース変化詳細コンポーネント（EP・蓄積値）
const ResourceChangesDetails: React.FC<{ entries: ResourceChangeEntry[] }> = ({ entries }) => {
  if (!entries || entries.length === 0) return null;

  // EP変化と蓄積値変化に分類
  const epChanges = entries.filter(e => e.resourceType === 'ep');
  const accumulatorChanges = entries.filter(e => e.resourceType === 'accumulator');
  const spChanges = entries.filter(e => e.resourceType === 'sp');
  const hpChanges = entries.filter(e => e.resourceType === 'hp');

  const formatChange = (change: number) => {
    if (change > 0) return `+${change.toFixed(1)}`;
    if (change < 0) return change.toFixed(1);
    return '0';
  };

  return (
    <div className="space-y-2">
      {/* SP変化 */}
      {spChanges.length > 0 && (
        <div className="space-y-1">
          <div className="text-xs font-semibold text-amber-600 dark:text-amber-400">
            ✨ SP変化:
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
            {spChanges.map((entry, idx) => (
              <div
                key={`sp-${idx}`}
                className={`flex items-center gap-2 px-2 py-1 rounded text-xs border-l-2 ${entry.change > 0
                  ? 'bg-amber-100 dark:bg-amber-900/50 border-amber-400'
                  : entry.change < 0
                    ? 'bg-zinc-100 dark:bg-zinc-900/50 border-zinc-400'
                    : 'bg-gray-100 dark:bg-gray-900/50 border-gray-400'
                  }`}
              >
                <span className="font-medium text-gray-700 dark:text-gray-300 truncate max-w-[80px]">
                  {entry.unitName}
                </span>
                <span className="text-gray-500 dark:text-gray-400">
                  {entry.before.toFixed(0)} → {entry.after.toFixed(0)}
                </span>
                <span className={`font-bold ${entry.change > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-zinc-600 dark:text-zinc-400'
                  }`}>
                  ({formatChange(entry.change)})
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* EP変化 */}
      {epChanges.length > 0 && (
        <div className="space-y-1">
          <div className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">
            ⚡ EP変化:
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
            {epChanges.map((entry, idx) => (
              <div
                key={`ep-${idx}`}
                className={`flex items-center gap-2 px-2 py-1 rounded text-xs border-l-2 ${entry.change > 0
                  ? 'bg-indigo-100 dark:bg-indigo-900/50 border-indigo-400'
                  : entry.change < 0
                    ? 'bg-orange-100 dark:bg-orange-900/50 border-orange-400'
                    : 'bg-gray-100 dark:bg-gray-900/50 border-gray-400'
                  }`}
              >
                <span className="font-medium text-gray-700 dark:text-gray-300 truncate max-w-[80px]">
                  {entry.unitName}
                </span>
                <span className="text-gray-500 dark:text-gray-400">
                  {entry.before.toFixed(1)} → {entry.after.toFixed(1)}
                </span>
                <span className={`font-bold ${entry.change > 0 ? 'text-indigo-600 dark:text-indigo-400' : 'text-orange-600 dark:text-orange-400'
                  }`}>
                  ({formatChange(entry.change)})
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* HP変化 */}
      {hpChanges.length > 0 && (
        <div className="space-y-1">
          <div className="text-xs font-semibold text-rose-600 dark:text-rose-400">
            ❤️ HP変化:
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
            {hpChanges.map((entry, idx) => (
              <div
                key={`hp-${idx}`}
                className={`flex items-center gap-2 px-2 py-1 rounded text-xs border-l-2 ${entry.change > 0
                  ? 'bg-green-50 dark:bg-green-900/30 border-green-500'
                  : entry.change < 0
                    ? 'bg-red-50 dark:bg-red-900/30 border-red-500'
                    : 'bg-gray-100 dark:bg-gray-900/50 border-gray-400'
                  }`}
              >
                <span className="font-medium text-gray-700 dark:text-gray-300 truncate max-w-[80px]">
                  {entry.unitName}
                </span>
                <span className="text-gray-500 dark:text-gray-400">
                  {Math.round(entry.before).toLocaleString()} → {Math.round(entry.after).toLocaleString()}
                </span>
                <span className={`font-bold ${entry.change > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                  }`}>
                  ({formatChange(entry.change)})
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 蓄積値変化 */}
      {accumulatorChanges.length > 0 && (
        <div className="space-y-1">
          <div className="text-xs font-semibold text-teal-600 dark:text-teal-400">
            📊 蓄積値変化:
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
            {accumulatorChanges.map((entry, idx) => (
              <div
                key={`acc-${idx}`}
                className={`flex items-center gap-2 px-2 py-1 rounded text-xs border-l-2 ${entry.change > 0
                  ? 'bg-teal-100 dark:bg-teal-900/50 border-teal-400'
                  : entry.change < 0
                    ? 'bg-amber-100 dark:bg-amber-900/50 border-amber-400'
                    : 'bg-gray-100 dark:bg-gray-900/50 border-gray-400'
                  }`}
              >
                <span className="font-medium text-gray-700 dark:text-gray-300 truncate max-w-[60px]" title={entry.unitName}>
                  {entry.unitName}
                </span>
                <span className="text-gray-500 dark:text-gray-400 truncate max-w-[40px]" title={entry.resourceName}>
                  [{entry.resourceName}]
                </span>
                <span className="text-gray-500 dark:text-gray-400">
                  {entry.before.toFixed(0)} → {entry.after.toFixed(0)}
                </span>
                <span className={`font-bold ${entry.change > 0 ? 'text-teal-600 dark:text-teal-400' : 'text-amber-600 dark:text-amber-400'
                  }`}>
                  ({formatChange(entry.change)})
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// 統計名のフォーマット関数（共通）
const formatStatName = (key: string) => {
  return getStatDisplayName(key);
};

// 値のフォーマット関数（共通）
const formatStatValue = (key: string, value: number) => {
  const nonPercentStats = ['hp', 'atk', 'def', 'spd', 'speed', 'aggro', 'max_ep'];
  const isPercent = !nonPercentStats.includes(key);

  if (isPercent) {
    return `${value > 0 ? '+' : ''}${(value * 100).toFixed(1)}%`;
  } else {
    return `${value > 0 ? '+' : ''}${value.toFixed(1)}`;
  }
};

// 統計サマリーコンポーネント
const StatSummary: React.FC<{ stats: { [key: string]: number }, effects: EffectSummary[], customTitle?: string }> = ({ stats, effects, customTitle = "📊 ステータス:" }) => {
  if (!stats || Object.keys(stats).length === 0) return null;

  // 定数ステータスのキー（実数表示する項目）
  const CONSTANT_STATS = ['hp', 'atk', 'def', 'spd', 'hp_current', 'ep_current', 'shield_current'];

  return (
    <div className="mt-1 p-2 bg-yellow-50 dark:bg-yellow-900/20 rounded border border-yellow-200 dark:border-yellow-800 text-xs">
      <div className="font-semibold text-yellow-800 dark:text-yellow-200 mb-1 flex items-center gap-1">
        <span>{customTitle}</span>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {Object.entries(stats).map(([key, value]) => {
          // 値が0に近い場合は表示しない
          if (value === undefined || value === null || isNaN(value) || Math.abs(value) < 0.0001) return null;

          const formattedValue = formatStatValue(key, value);

          // 内訳の計算
          const contributors = effects.filter(e => e.modifiers?.some(m => m.stat === key))
            .map(e => {
              const mod = e.modifiers!.find(m => m.stat === key);
              return mod ? { name: e.name, value: mod.value } : null;
            })
            .filter((c): c is { name: string; value: number } => c !== null);

          return (
            <div key={key} className="relative group cursor-help text-gray-700 dark:text-gray-300 flex items-center">
              <span className="opacity-75 mr-0.5">{formatStatName(key)}</span>
              <span className="font-bold">{formattedValue}</span>

              {/* ツールチップ: 内訳表示 */}
              {contributors.length > 0 && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-50 w-max max-w-xs pointer-events-none">
                  <div className="bg-gray-800 dark:bg-gray-700 text-white text-xs rounded py-1 px-2 shadow-xl border border-gray-600">
                    <div className="font-bold mb-1 border-b border-gray-500 pb-1">{formatStatName(key)} 内訳</div>
                    {contributors.map((c, i) => (
                      <div key={i} className="flex justify-between gap-4">
                        <span>{c.name}</span>
                        <span className="font-mono">
                          {formatStatValue(key, c.value)}
                        </span>
                      </div>
                    ))}
                  </div>
                  {/* 矢印 */}
                  <div className="w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-t-[4px] border-t-gray-800 dark:border-t-gray-700 absolute left-1/2 -translate-x-1/2 top-full"></div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// 効果リストコンポーネント
const EffectList: React.FC<{ effects: EffectSummary[], title: string, stats?: { [key: string]: number }, emptyMessage?: string, statsTitle?: string }> = ({ effects, title, stats, emptyMessage = "なし", statsTitle }) => {
  if (!effects || (effects.length === 0 && !stats)) return (
    <div className="flex flex-col gap-1 min-h-[24px]">
      <div className="font-semibold text-xs text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700 pb-0.5 mb-0.5 w-fit">{title}</div>
      <span className="text-gray-400 italic text-xs">{emptyMessage}</span>
    </div>
  );

  return (
    <div className="flex flex-col gap-1">
      <div className="font-semibold text-xs text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700 pb-0.5 mb-0.5 w-fit">{title}</div>
      <div className="flex flex-wrap gap-1.5 items-center">
        {effects.map((e, i) => (
          <div key={i} className="group relative cursor-help bg-gray-200 dark:bg-gray-700 px-1.5 py-0.5 rounded flex items-center gap-1 text-xs hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors">
            <span>{e.name}</span>
            <span className="text-gray-500 dark:text-gray-400 text-[10px]">{e.duration !== '∞' ? `(${e.duration}T)` : '(∞)'}</span>

            {/* Tooltip */}
            <div className="invisible group-hover:visible absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 pointer-events-none">
              <div className="bg-gray-800 dark:bg-gray-700 text-white text-xs rounded py-1 px-2 whitespace-nowrap shadow-xl border border-gray-600">
                {e.owner && <div className="font-semibold text-gray-300 mb-0.5">From: {e.owner}</div>}
                {/* スタック数表示 */}
                {e.stackCount !== undefined && e.stackCount > 0 && (
                  <div className="flex gap-2 justify-between text-yellow-400">
                    <span>層数:</span>
                    <span className="font-bold">{e.stackCount}層</span>
                  </div>
                )}
                {/* 蓄積値表示 */}
                {e.value !== undefined && e.value > 0 && (
                  <div className="flex gap-2 justify-between text-cyan-400">
                    <span>蓄積値:</span>
                    <span className="font-bold">{Math.floor(e.value)}</span>
                  </div>
                )}
                {e.modifiers && e.modifiers.length > 0 ? (
                  <div className="flex flex-col gap-0.5">
                    {e.modifiers.map((m, idx) => (
                      <div key={idx} className="flex gap-2 justify-between">
                        <span>{formatStatName(m.stat)}:</span>
                        <span>{formatStatValue(m.stat, m.value)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  !e.stackCount && !e.value && <div className="text-gray-400">効果なし</div>
                )}
              </div>
              {/* Arrow */}
              <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-800 dark:border-t-gray-700"></div>
            </div>
          </div>
        ))}
      </div>
      {stats && <StatSummary stats={stats} effects={effects} customTitle={statsTitle} />}
    </div>
  );
};

const SimulationLogTable: React.FC<SimulationLogTableProps> = ({ logs }) => {
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

  const toggleRow = (index: number) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedRows(newExpanded);
  };

  // ログに詳細があるかどうかを判定
  const hasLogDetails = (log: SimulationLogEntry): boolean => {
    const hasHitDetails = log.hitDetails && log.hitDetails.length > 0;
    const hasDetails = log.logDetails && (
      (log.logDetails.primaryDamage && log.logDetails.primaryDamage.hitDetails.length > 0) ||
      (log.logDetails.additionalDamage && log.logDetails.additionalDamage.length > 0) ||
      (log.logDetails.healing && log.logDetails.healing.length > 0) ||
      (log.logDetails.shields && log.logDetails.shields.length > 0) ||
      (log.logDetails.damageTaken && log.logDetails.damageTaken.length > 0) ||
      (log.logDetails.equipmentEffects && log.logDetails.equipmentEffects.length > 0) ||
      (log.logDetails.resourceChanges && log.logDetails.resourceChanges.length > 0)
    );
    const hasEffects = !!((log.sourceEffects && log.sourceEffects.length > 0) || (log.targetEffects && log.targetEffects.length > 0) || (log.activeEffects && log.activeEffects.length > 0));
    return hasHitDetails || !!hasDetails || hasEffects;
  };

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm text-left text-gray-500 dark:text-gray-400">
        <thead className="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-gray-700 dark:text-gray-400">
          <tr>
            <th scope="col" className="px-2 py-3 w-8"></th>
            <th scope="col" className="px-4 py-3">キャラ名</th>
            <th scope="col" className="px-4 py-3">行動時間</th>
            <th scope="col" className="px-4 py-3">行動の種類</th>
            <th scope="col" className="px-4 py-3">SP</th>
            <th scope="col" className="px-4 py-3">EP</th>
            <th scope="col" className="px-4 py-3">与ダメ</th>
            <th scope="col" className="px-4 py-3">被ダメ</th>
            <th scope="col" className="px-4 py-3">回復</th>
            <th scope="col" className="px-4 py-3">シールド</th>
            <th scope="col" className="px-4 py-3">自身HP</th>
            <th scope="col" className="px-4 py-3">対象HP</th>
            <th scope="col" className="px-4 py-3">対象靭性</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((log, index) => {
            const showToggle = hasLogDetails(log);
            const isExpanded = expandedRows.has(index);

            // 新しい集計値を使用、なければ後方互換性のため旧値を使用
            const damageDealt = log.totalDamageDealt ?? log.damageDealt ?? 0;
            const damageTaken = log.totalDamageTaken ?? 0;
            const healing = log.totalHealing ?? log.healingDone ?? 0;
            const shield = log.totalShieldGiven ?? log.shieldApplied ?? 0;

            return (
              <React.Fragment key={index}>
                <tr className="dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer" onClick={() => showToggle && toggleRow(index)}>
                  <td className="px-2 py-4 text-center">
                    {showToggle && (
                      <button
                        className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 focus:outline-none"
                        onClick={(e) => { e.stopPropagation(); toggleRow(index); }}
                      >
                        {isExpanded ? '▼' : '▶'}
                      </button>
                    )}
                  </td>
                  <th scope="row" className="px-4 py-4 font-medium text-gray-900 whitespace-nowrap dark:text-white">
                    {log.characterName || (log.sourceId ? `Unit ${log.sourceId}` : 'Unknown')}
                  </th>
                  <td className="px-4 py-4">{log.actionTime !== undefined ? log.actionTime.toFixed(2) : (log.time !== undefined ? log.time.toFixed(2) : '-')}</td>
                  <td className="px-4 py-4">
                    {log.actionType}
                    {log.details && <div className="text-xs text-gray-400">{log.details}</div>}
                  </td>
                  <td className="px-4 py-4">{log.skillPointsAfterAction ?? '-'}</td>
                  <td className="px-4 py-4">{log.currentEp !== undefined ? (Math.floor(log.currentEp * 100) / 100).toFixed(2) : '-'}</td>
                  <td className="px-4 py-4 font-bold text-red-600">
                    {damageDealt > 0 ? Math.round(damageDealt) : '-'}
                  </td>
                  <td className="px-4 py-4 text-orange-600">
                    {damageTaken > 0 ? `-${Math.round(damageTaken)}` : '-'}
                  </td>
                  <td className="px-4 py-4 text-green-600">
                    {healing > 0 ? `+${Math.round(healing)}` : '-'}
                  </td>
                  <td className="px-4 py-4 text-purple-600">
                    {shield > 0 ? Math.round(shield) : '-'}
                  </td>
                  <td className="px-4 py-4 text-xs">{log.sourceHpState ?? '-'}</td>
                  <td className="px-4 py-4 text-xs">{log.targetHpState ?? '-'}</td>
                  <td className="px-4 py-4 text-xs text-cyan-600 dark:text-cyan-400">{log.targetToughness ?? '-'}</td>
                </tr>

                {/* 詳細行（展開時のみ表示） */}
                {isExpanded && showToggle && (
                  <tr className="bg-gray-50 dark:bg-gray-800">
                    <td colSpan={13} className="px-4 py-3 space-y-3">
                      {/* 統一アクション詳細表示 */}
                      {(log.logDetails?.primaryDamage || log.logDetails?.additionalDamage || log.logDetails?.damageTaken || log.logDetails?.healing || log.logDetails?.shields) && (
                        <UnifiedActionDetails
                          primaryDamage={log.logDetails.primaryDamage}
                          additionalDamage={log.logDetails.additionalDamage}
                          damageTaken={log.logDetails.damageTaken}
                          healing={log.logDetails.healing}
                          shields={log.logDetails.shields}
                        />
                      )}

                      {/* 後方互換性: hitDetails のみある場合 */}
                      {!log.logDetails?.primaryDamage && !log.logDetails?.additionalDamage && log.hitDetails && log.hitDetails.length > 0 && (
                        <div>
                          <div className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">ヒット詳細:</div>
                          <HitDetailsRow hitDetails={log.hitDetails} />
                        </div>
                      )}

                      {/* 被ダメージ、回復、シールドは UnifiedActionDetails に統合されたため削除 */}

                      {/* 装備効果 */}
                      {log.logDetails?.equipmentEffects && (
                        <EquipmentEffectDetails entries={log.logDetails.equipmentEffects} />
                      )}

                      {/* リソース変化（EP・蓄積値） */}
                      {log.logDetails?.resourceChanges && (
                        <ResourceChangesDetails entries={log.logDetails.resourceChanges} />
                      )}

                      {/* アクションキュー表示 */}
                      {log.actionQueue && log.actionQueue.length > 0 && (
                        <div className="mt-2 p-2 bg-blue-50 dark:bg-blue-900/20 rounded border border-blue-200 dark:border-blue-700">
                          <div className="text-xs font-semibold text-blue-700 dark:text-blue-300 mb-1">アクションキュー</div>
                          <div className="flex flex-wrap gap-1 text-xs">
                            {log.actionQueue.map((entry, idx) => (
                              <span key={idx} className={`px-1.5 py-0.5 rounded ${idx === 0 ? 'bg-blue-500 text-white' : 'bg-gray-200 dark:bg-gray-700'}`}>
                                {entry.unitName}: {entry.actionValue.toFixed(1)}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* 効果・ステータス詳細（トグル） */}
                      {(log.sourceEffects || log.targetEffects || (log.activeEffects && log.activeEffects.length > 0)) && (
                        <details className="mt-2 p-2 bg-gray-100 dark:bg-gray-700/50 rounded border border-gray-200 dark:border-gray-600">
                          <summary className="cursor-pointer font-semibold text-sm text-gray-700 dark:text-gray-300 select-none">
                            ステータス・効果詳細
                          </summary>
                          <div className="mt-2 pl-2">
                            {/* 新しい表示形式: 分割表示 */}
                            {log.sourceEffects || log.targetEffects ? (
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {/* Source Effects */}
                                <div className="bg-gray-100/50 dark:bg-gray-700/30 p-2 rounded border border-gray-200 dark:border-gray-700">
                                  <EffectList
                                    effects={log.sourceEffects || []}
                                    title="自身 (Source)"
                                    stats={log.sourceFinalStats || log.statTotals?.source}
                                    emptyMessage="自身へのバフなし"
                                    statsTitle={log.sourceFinalStats ? "📊 ステータス:" : "📊 バフ合計:"}
                                  />
                                </div>

                                {/* Target Effects */}
                                <div className="bg-gray-100/50 dark:bg-gray-700/30 p-2 rounded border border-gray-200 dark:border-gray-700">
                                  <EffectList
                                    effects={log.targetEffects || []}
                                    title="対象 (Target)"
                                    stats={log.targetFinalStats || log.statTotals?.target}
                                    emptyMessage="ターゲットへのデバフなし"
                                    statsTitle={log.targetFinalStats ? "📊 ステータス:" : "📊 バフ合計:"}
                                  />
                                </div>
                              </div>
                            ) : (
                              /* 後方互換性: 旧表示形式 */
                              <div className="flex flex-wrap gap-2 min-h-[24px] items-center">
                                <span className="font-semibold">効果:</span>
                                {log.activeEffects && log.activeEffects.length > 0 ? (
                                  log.activeEffects.map((e, i) => (
                                    <span key={i} className="bg-gray-200 dark:bg-gray-700 px-1 rounded flex items-center gap-1">
                                      {e.owner && <span className="text-gray-500 dark:text-gray-400">[From: {e.owner}]</span>}
                                      <span>{e.name}</span>
                                      <span className="text-gray-500 dark:text-gray-400">({typeof e.duration === 'number' ? `残${e.duration}T` : '∞'})</span>
                                    </span>
                                  ))
                                ) : (
                                  <span className="text-gray-400 italic">なし</span>
                                )}
                              </div>
                            )}
                          </div>
                        </details>
                      )}
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default SimulationLogTable;
