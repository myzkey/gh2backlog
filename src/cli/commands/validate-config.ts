import { loadConfig, validateConfig } from '@/core';

type ValidateConfigArgs = {
  config?: string;
};

export async function validateConfigCommand(args: ValidateConfigArgs): Promise<void> {
  try {
    const config = loadConfig(args.config);
    const errors = validateConfig(config);

    if (errors.length === 0) {
      console.log('Configuration is valid');
      console.log('\nLoaded configuration:');
      // Mask API key for security
      const displayConfig = {
        ...config,
        backlog: {
          ...config.backlog,
          apiKey: config.backlog.apiKey ? '********' : '(not set)',
        },
      };
      console.log(JSON.stringify(displayConfig, null, 2));
    } else {
      console.error('Configuration errors:');
      for (const error of errors) {
        console.error(`  - ${error}`);
      }
      process.exit(1);
    }
  } catch (error) {
    console.error('Failed to load configuration:', error);
    process.exit(1);
  }
}
