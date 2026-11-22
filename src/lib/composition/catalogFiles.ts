/** The catalog's definition files, as text, keyed `/catalog/<name>.json`. */
export const CATALOG_FILES: Readonly<Record<string, string>> = import.meta.glob<string>(
	'/catalog/*.json',
	{ eager: true, query: '?raw', import: 'default' }
);
