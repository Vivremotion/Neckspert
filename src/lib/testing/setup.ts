// Fills the registries for every test file, as `createApp` does at startup.
import { CATALOG_FILES } from '$lib/composition/catalogFiles';
import { loadDefinitions } from '$lib/composition/definitions';

loadDefinitions({ catalog: CATALOG_FILES });
