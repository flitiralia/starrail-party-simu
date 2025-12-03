import React from 'react';
import { SimulationLogEntry } from '@/app/types';

interface SimulationLogTableProps {
  logs: SimulationLogEntry[];
}

const SimulationLogTable: React.FC<SimulationLogTableProps> = ({ logs }) => {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm text-left text-gray-500 dark:text-gray-400">
        <thead className="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-gray-700 dark:text-gray-400">
          <tr>
            <th scope="col" className="px-4 py-3">キャラ名</th>
            <th scope="col" className="px-4 py-3">行動時間</th>
            <th scope="col" className="px-4 py-3">行動の種類</th>
            <th scope="col" className="px-4 py-3">SP</th>
            <th scope="col" className="px-4 py-3">EP</th>
            <th scope="col" className="px-4 py-3">与ダメージ</th>
            <th scope="col" className="px-4 py-3">与回復</th>
            <th scope="col" className="px-4 py-3">与バリア</th>
            <th scope="col" className="px-4 py-3">自身HP/最大HP</th>
            <th scope="col" className="px-4 py-3">対象HP/最大HP</th>
            <th scope="col" className="px-4 py-3">敵靭性</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((log, index) => (
            <React.Fragment key={index}>
              <tr className="dark:border-gray-700">
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
                <td className="px-4 py-4">{log.damageDealt !== undefined ? Math.round(log.damageDealt) : (log.damage !== undefined ? Math.round(log.damage) : '-')}</td>
                <td className="px-4 py-4">{log.healingDone !== undefined ? Math.round(log.healingDone) : '-'}</td>
                <td className="px-4 py-4">{log.shieldApplied !== undefined ? Math.round(log.shieldApplied) : '-'}</td>
                <td className="px-4 py-4">{log.sourceHpState ?? '-'}</td>
                <td className="px-4 py-4">{log.targetHpState ?? '-'}</td>
                <td className="px-4 py-4">{log.targetToughness ?? '-'}</td>
              </tr>
              <tr className="border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                <td colSpan={11} className="px-4 py-2 text-xs text-gray-600 dark:text-gray-300">
                  <div className="flex flex-wrap gap-2 min-h-[24px] items-center">
                    <span className="font-semibold">効果:</span>
                    {log.activeEffects && log.activeEffects.length > 0 ? (
                      log.activeEffects.map((e, i) => (
                        <span key={i} className="bg-gray-200 dark:bg-gray-700 px-1 rounded flex items-center gap-1">
                          {e.owner && <span className="text-gray-500 dark:text-gray-400">[From: {e.owner}]</span>}
                          <span>{e.name}</span>
                          <span className="text-gray-500 dark:text-gray-400">(残{e.duration}T)</span>
                        </span>
                      ))
                    ) : (
                      <span className="text-gray-400 italic">なし</span>
                    )}
                  </div>
                </td>
              </tr>
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default SimulationLogTable;
