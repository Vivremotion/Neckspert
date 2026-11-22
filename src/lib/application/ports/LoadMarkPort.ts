/**
 * A mark kept across page loads, set while the imported definition files load and cleared once
 * the load returned: found set at the next start, it says that load never finished.
 */
export interface LoadMarkPort {
	set(): void;
	clear(): void;
	isSet(): boolean;
}
