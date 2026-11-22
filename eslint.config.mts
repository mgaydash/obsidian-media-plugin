import obsidianmd from 'eslint-plugin-obsidianmd';
import globals from 'globals';
import { globalIgnores, defineConfig } from 'eslint/config';

export default defineConfig(
	globalIgnores([
		'node_modules',
		'dist',
		'esbuild.config.mjs',
		'version-bump.mjs',
		'versions.json',
		'main.js',
		'package.json',
		'package-lock.json',
		'tsconfig.json',
	]),
	{
		languageOptions: {
			globals: {
				...globals.browser,
			},
			parserOptions: {
				projectService: {
					allowDefaultProject: ['eslint.config.mts', 'manifest.json'],
				},
				tsconfigRootDir: import.meta.dirname,
				extraFileExtensions: ['.json'],
			},
		},
	},
	...obsidianmd.configs.recommended,
	{
		rules: {
			'obsidianmd/ui/sentence-case': [
				'warn',
				{
					brands: ['Media Notes', 'Obsidian', 'Keychain', 'TMDB', 'IGDB', 'Twitch', 'Google Books', 'MusicBrainz'],
					acronyms: ['API', 'ID', 'IGDB', 'TMDB', 'TV'],
				},
			],
		},
	},
	{
		// expect(mock.method) is the normal way to assert on a mock.
		files: ['tests/**/*.ts'],
		rules: { '@typescript-eslint/unbound-method': 'off' },
	},
);
