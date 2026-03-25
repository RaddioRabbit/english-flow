import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { textAnalysisApiPlugin } from "./server/text-analysis-plugin";
import { imageGenerationApiPlugin } from "./server/image-generation-plugin";
import { sentenceExplanationApiPlugin } from "./server/sentence-explanation-plugin";
import { sentenceExplanationTtsApiPlugin } from "./server/sentence-explanation-tts-plugin";
import { sentenceExplanationVideoApiPlugin } from "./server/sentence-explanation-video-plugin";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    server: {
      host: "::",
      port: 8080,
      hmr: {
        overlay: false,
      },
    },
    envPrefix: ["VITE_", "NEXT_PUBLIC_"],
    plugins: [
      react(),
      textAnalysisApiPlugin(env),
      imageGenerationApiPlugin(env),
      sentenceExplanationApiPlugin(env),
      sentenceExplanationTtsApiPlugin(env),
      sentenceExplanationVideoApiPlugin(),
      mode === "development" && componentTagger(),
    ].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
