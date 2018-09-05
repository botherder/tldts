import * as punycode from 'punycode';
import { startsWith } from './polyfill';

interface IOptions {
  allowIcannDomains: boolean;
  allowPrivateDomains: boolean;
}

// Flags used to know if a rule is ICANN or Private
const ICANN_HOSTNAME = 1;
const PRIVATE_HOSTNAME = 2;

export interface IRule {
  exception: boolean;
  isIcann: boolean;
  parts: string[];
  source: string;
}

interface IMatch {
  index: number;
  isIcann: boolean;
  isPrivate: boolean;
}

interface ITrieObject {
  [s: string]: ITrieObject | string;
}

/**
 * Return the lookup object having the longest match, ignoring possible `-1` values.
 */
function longestMatch(a: IMatch, b: IMatch): IMatch {
  if (a.index === -1) {
    return b;
  } else if (b.index === -1) {
    return a;
  }

  return a.index < b.index ? a : b;
}

/**
 * Insert a public suffix rule in the `trie`.
 */
function insertInTrie(rule: IRule, trie: any): any {
  const parts = rule.parts;
  let node = trie;

  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i];
    let nextNode = node[part];
    if (nextNode === undefined) {
      nextNode = Object.create(null);
      node[part] = nextNode;
    }

    node = nextNode;
  }

  node.$ = rule.isIcann ? ICANN_HOSTNAME : PRIVATE_HOSTNAME;

  return trie;
}

/**
 * Recursive lookup of `parts` (starting at `index`) in the tree.
 *
 * @param {array} parts
 * @param {object} trie
 * @param {number} index - when to start in `parts` (initially: length - 1)
 * @return {number} size of the suffix found (in number of parts matched)
 */
function lookupInTrie(parts: string[], trie: any, index: number, allowedMask: number): IMatch {
  let part;
  let nextNode;
  let lookupResult = {
    index: -1,
    isIcann: false,
    isPrivate: false,
  };

  // We have a match!
  if (trie.$ !== undefined && (trie.$ & allowedMask) !== 0) {
    lookupResult = {
      index: index + 1,
      isIcann: trie.$ === ICANN_HOSTNAME,
      isPrivate: trie.$ === PRIVATE_HOSTNAME,
    };
  }

  // No more `parts` to look for
  if (index === -1) {
    return lookupResult;
  }

  part = parts[index];

  // Check branch corresponding to next part of hostname
  nextNode = trie[part];
  if (nextNode !== undefined) {
    lookupResult = longestMatch(
      lookupResult,
      lookupInTrie(parts, nextNode, index - 1, allowedMask),
    );
  }

  // Check wildcard branch
  nextNode = trie['*'];
  if (nextNode !== undefined) {
    lookupResult = longestMatch(
      lookupResult,
      lookupInTrie(parts, nextNode, index - 1, allowedMask),
    );
  }

  return lookupResult;
}

/**
 * Contains the public suffix ruleset as a Trie for efficient look-up.
 */
export default class SuffixTrie {
  public exceptions: ITrieObject;
  public rules: ITrieObject;

  constructor(rules: IRule[]) {
    this.exceptions = Object.create(null);
    this.rules = Object.create(null);

    for (let i = 0; i < rules.length; i += 1) {
      const rule = rules[i];
      if (rule.exception) {
        insertInTrie(rule, this.exceptions);
      } else {
        insertInTrie(rule, this.rules);
      }
    }
  }

  /**
   * Check if `value` is a valid TLD.
   */
  public hasTld(value: string): boolean {
    // All TLDs are at the root of the Trie.
    return this.rules[value] !== undefined;
  }

  /**
   * Check if `hostname` has a valid public suffix in `trie`.
   *
   * @param {string} hostname
   * @return {string|null} public suffix
   */
  public suffixLookup(hostname: string, options: IOptions): any {
    const allowIcannDomains = options.allowIcannDomains;
    const allowPrivateDomains = options.allowPrivateDomains;

    const hostnameParts = hostname.split('.');
    const parts = [];
    for (let i = 0; i < hostnameParts.length; i += 1) {
      let part = hostnameParts[i];
      if (startsWith(part, 'xn--')) {
        part = punycode.toUnicode(part);
      }
      parts.push(part);
    }

    let allowedMask = 0;

    // Define set of accepted public suffix (ICANN, PRIVATE)
    if (allowPrivateDomains === true) {
      allowedMask |= PRIVATE_HOSTNAME;
    }
    if (allowIcannDomains === true) {
      allowedMask |= ICANN_HOSTNAME;
    }

    // Look for a match in rules
    const lookupResult = lookupInTrie(
      parts,
      this.rules,
      parts.length - 1,
      allowedMask,
    );

    if (lookupResult.index === -1) {
      return null;
    }

    // Look for exceptions
    const exceptionLookupResult = lookupInTrie(
      parts,
      this.exceptions,
      parts.length - 1,
      allowedMask,
    );

    if (exceptionLookupResult.index !== -1) {
      return {
        isIcann: exceptionLookupResult.isIcann,
        isPrivate: exceptionLookupResult.isPrivate,
        publicSuffix: hostnameParts.slice(exceptionLookupResult.index + 1).join('.'),
      };
    }

    return {
      isIcann: lookupResult.isIcann,
      isPrivate: lookupResult.isPrivate,
      publicSuffix: hostnameParts.slice(lookupResult.index).join('.'),
    };
  }
}
