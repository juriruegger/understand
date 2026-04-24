import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

import { runUnderstandGit } from './git.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const UnderstandPlugin = async ({ directory }: { directory?: string }) => {
  const skillsDir = path.resolve(__dirname, '../skills');

  return {
    config: async (config: Record<string, unknown>) => {
      const mutableConfig = config as {
        skills?: {
          paths?: string[];
        };
      };

      mutableConfig.skills ??= {};
      mutableConfig.skills.paths ??= [];

      if (!mutableConfig.skills.paths.includes(skillsDir)) {
        mutableConfig.skills.paths.push(skillsDir);
      }
    },

    tools: [
      {
        name: 'understand_git',
        description:
          'Generate structured git manifests for the understand skill. Use for branch target selection, branch diff manifests, or uncommitted change manifests.',
        schema: z.object({
          action: z.enum(['targets', 'branch-manifest', 'uncommitted-manifest']),
          target: z.string().optional(),
          refresh: z.boolean().optional()
        }),
        execute: async ({ action, target, refresh }: { action: 'targets' | 'branch-manifest' | 'uncommitted-manifest'; target?: string; refresh?: boolean }) => {
          const result = runUnderstandGit({
            action,
            cwd: directory ?? process.cwd(),
            target,
            refresh
          });

          return JSON.stringify(result, null, 2);
        }
      }
    ]
  };
};
