// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// https://astro.build/config
export default defineConfig({
	site: 'https://ruthgrace.github.io',
	base: '/procedural-legitimacy-wiki',
	integrations: [
		starlight({
			title: 'Procedural Legitimacy',
			tableOfContents: false,
			sidebar: [
				{
					label: 'Topics',
					autogenerate: { directory: 'topics' },
				},
				{
					label: 'Papers',
					autogenerate: { directory: 'papers' },
				},
			],
		}),
	],
});
