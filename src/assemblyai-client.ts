import packageJson from '../package.json';
import { AssemblyAI } from "assemblyai";

export function getAssemblyAIClient(): AssemblyAI {
  return new AssemblyAI({
    apiKey: process.env.ASSEMBLYAI_API_KEY!,
    baseUrl: process.env.ASSEMBLYAI_BASE_URL || undefined,
    userAgent: {
      integration: {
        name: 'Slack bot',
        version: packageJson.version
      }
    }
  });
}
