import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Plugin, tool } from '@opencode-ai/plugin';

import { runUnderstandGit } from './git.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const UnderstandPlugin: Plugin = async ({ directory }) => {
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

    tool: {
      understand_git: tool({
        description:
          'Generate structured git manifests for the understand skill. Use for branch target selection, branch diff manifests, or uncommitted change manifests.',
        args: {
          action: tool.schema.enum(['targets', 'branch-manifest', 'uncommitted-manifest']).describe('Manifest action to run'),
          target: tool.schema.string().optional().describe('Target branch or ref for branch-manifest'),
          refresh: tool.schema.boolean().optional().describe('Refresh remote refs before computing branch-based results')
        },
        async execute({ action, target, refresh }, context) {
          const result = runUnderstandGit({
            action,
            cwd: context.directory,
            target,
            refresh
          });

          return JSON.stringify(result, null, 2);
        }
      })
    }
  };
};
