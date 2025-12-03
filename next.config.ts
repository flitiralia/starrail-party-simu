import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  turbopack: {}, // Turbopack設定を空で追加してエラーを回避
  webpack: (config, { isServer, webpack }) => {
    // Web Workerをasset/resourceとして処理するように設定
    // Next.js 12以降では推奨される方法
    config.module.rules.push({
      test: /\.worker\.ts$/,
      type: 'asset/resource', // worker-loaderの代わりにasset/resourceを使用
      generator: {
        filename: 'static/[hash].worker.js',
      },
    });

    // Node.js環境（サーバーサイド）でWorkerを解決しないようにする
    if (isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
      };
    }

    return config;
  },
};

export default nextConfig;
