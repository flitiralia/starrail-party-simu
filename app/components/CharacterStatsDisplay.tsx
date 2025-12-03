'use client';

import { Character, FinalStats } from '@/app/types';

interface Props {
  character: Character | null;
  stats: FinalStats | null;
  currentHp: number;    // 現在のHPを追加
  currentShield: number; // 現在のバリア値を追加
}

const cardStyle: React.CSSProperties = {
  borderWidth: '1px',
  borderStyle: 'solid',
  borderColor: '#ccc',
  padding: '16px',
  margin: '16px',
  borderRadius: '8px',
  fontFamily: 'sans-serif',
  minWidth: '300px',
};

const sectionStyle: React.CSSProperties = {
  marginTop: '16px',
  borderTop: '1px solid #eee',
  paddingTop: '16px',
};

export default function CharacterStatsDisplay({ character, stats, currentHp, currentShield }: Props) {
  if (!character) {
    return (
      <div style={cardStyle}>
        <p>キャラクターを選択してください。</p>
      </div>
    );
  }

  return (
    <div style={cardStyle}>
      <header>
        <h2>{character.name}</h2>
        <p>
          運命: {character.path} / 属性: {character.element}
        </p>
      </header>

      <section style={sectionStyle}>
        <h4>現在の状態</h4>
        <ul>
          <li>HP: {currentHp.toFixed(0)} / {stats?.hp.toFixed(0) || 'N/A'}</li>
          <li>バリア: {currentShield.toFixed(0)}</li>
        </ul>
      </section>

      {stats && (
        <section style={sectionStyle}>
          <h4>最終ステータス</h4>
          <ul style={{ columns: 2 }}>
            <li>HP: {stats.hp.toFixed(0)}</li>
            <li>攻撃力: {stats.atk.toFixed(0)}</li>
            <li>防御力: {stats.def.toFixed(0)}</li>
            <li>速度: {stats.spd.toFixed(1)}</li>
            <li>会心率: {(stats.crit_rate * 100).toFixed(1)}%</li>
            <li>会心ダメージ: {(stats.crit_dmg * 100).toFixed(1)}%</li>
            <li>撃破特効: {(stats.break_effect * 100).toFixed(1)}%</li>
            <li>治癒量: {(stats.outgoing_healing_boost * 100).toFixed(1)}%</li>
            <li>EP効率: {(stats.energy_regen_rate * 100).toFixed(1)}%</li>
            <li>効果命中: {(stats.effect_hit_rate * 100).toFixed(1)}%</li>
            <li>効果抵抗: {(stats.effect_res * 100).toFixed(1)}%</li>
            <li>物理与ダメ: {(stats.physical_dmg_boost * 100).toFixed(1)}%</li>
            <li>炎与ダメ: {(stats.fire_dmg_boost * 100).toFixed(1)}%</li>
            <li>氷与ダメ: {(stats.ice_dmg_boost * 100).toFixed(1)}%</li>
            <li>雷与ダメ: {(stats.lightning_dmg_boost * 100).toFixed(1)}%</li>
            <li>風与ダメ: {(stats.wind_dmg_boost * 100).toFixed(1)}%</li>
            <li>量子与ダメ: {(stats.quantum_dmg_boost * 100).toFixed(1)}%</li>
            <li>虚数与ダメ: {(stats.imaginary_dmg_boost * 100).toFixed(1)}%</li>
          </ul>
        </section>
      )}
    </div>
  );
}
