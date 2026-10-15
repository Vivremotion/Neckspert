/** Greatest common divisor by Euclid's algorithm, on non-negative safe integers. */
function gcd(a: number, b: number): number {
	let x = a;
	let y = b;
	while (y !== 0) {
		[x, y] = [y, x % y];
	}
	return x;
}

/** Throws `RangeError` unless `value` is a safe integer; returns it, with `-0` folded into `0`. */
function safe(value: number, what: string): number {
	if (!Number.isSafeInteger(value)) {
		throw new RangeError(`${what} must be a safe integer, got ${value}`);
	}
	return value === 0 ? 0 : value;
}

const TEXT = /^(-?\d+)(?:\/(\d+))?$/;

/**
 * An exact rational number, always normalised (lowest terms, positive denominator).
 * Musical positions and durations are fractions of a whole note so that tuplets and
 * subdivisions never accumulate floating-point error. Arithmetic throws `RangeError`
 * when a result leaves the safe integers rather than silently losing precision.
 */
export class Fraction {
	static readonly ZERO = new Fraction(0, 1);

	private constructor(
		readonly n: number,
		readonly d: number
	) {}

	/** `n/d` in lowest terms; `d` defaults to 1. Throws unless both are safe integers and `d` is not 0. */
	static of(n: number, d = 1): Fraction {
		safe(n, 'numerator');
		safe(d, 'denominator');
		if (d === 0) throw new RangeError('denominator must not be 0');
		const sign = d < 0 ? -1 : 1;
		const g = gcd(Math.abs(n), Math.abs(d));
		return new Fraction(safe((sign * n) / g, 'numerator'), Math.abs(d) / g);
	}

	/** Reads `"3/8"`, `"2"` or `"-1/4"`; throws on anything else. */
	static parse(text: string): Fraction {
		const match = TEXT.exec(text);
		if (!match) throw new SyntaxError(`not a fraction: "${text}"`);
		return Fraction.of(Number(match[1]), match[2] === undefined ? 1 : Number(match[2]));
	}

	add(o: Fraction): Fraction {
		const g = gcd(this.d, o.d);
		return Fraction.of(this.n * (o.d / g) + o.n * (this.d / g), (this.d / g) * o.d);
	}

	sub(o: Fraction): Fraction {
		return this.add(Fraction.of(-o.n, o.d));
	}

	mul(o: Fraction): Fraction {
		// Cross-reduce first so that products stay small when they can.
		const g1 = gcd(Math.abs(this.n), o.d);
		const g2 = gcd(Math.abs(o.n), this.d);
		return Fraction.of((this.n / g1) * (o.n / g2), (this.d / g2) * (o.d / g1));
	}

	div(o: Fraction): Fraction {
		if (o.n === 0) throw new RangeError('division by zero');
		return this.mul(Fraction.of(o.d, o.n));
	}

	/** Exact ordering, even when the cross products would not be safe numbers. */
	compare(o: Fraction): -1 | 0 | 1 {
		const left = BigInt(this.n) * BigInt(o.d);
		const right = BigInt(o.n) * BigInt(this.d);
		return left < right ? -1 : left > right ? 1 : 0;
	}

	equals(o: Fraction): boolean {
		return this.n === o.n && this.d === o.d;
	}

	toNumber(): number {
		return this.n / this.d;
	}

	/** `"3/8"`, or `"2"` for a whole number. */
	toString(): string {
		return this.d === 1 ? `${this.n}` : `${this.n}/${this.d}`;
	}

	toJSON(): string {
		return this.toString();
	}
}
