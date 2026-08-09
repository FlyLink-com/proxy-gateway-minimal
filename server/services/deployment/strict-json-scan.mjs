function syntaxError() {
  throw new Error("canonical_json_syntax_invalid");
}

function isWhitespace(character) {
  return character === "\u0009"
    || character === "\u000a"
    || character === "\u000d"
    || character === "\u0020";
}

function isHex(character) {
  return typeof character === "string" && /^[0-9a-fA-F]$/.test(character);
}

/**
 * Walk one JSON document without materializing an object so duplicate object
 * keys are rejected before JSON.parse can discard earlier values. Keys are
 * compared after JSON string unescaping, which also rejects `"a"` and
 * `"\\u0061"` as the same key.
 */
export function assertNoDuplicateObjectKeys(text) {
  if (typeof text !== "string") syntaxError();

  let index = 0;

  function skipWhitespace() {
    while (index < text.length && isWhitespace(text[index])) index += 1;
  }

  function parseString() {
    if (text[index] !== '"') syntaxError();
    const start = index;
    index += 1;

    while (index < text.length) {
      const character = text[index];
      if (character === '"') {
        index += 1;
        try {
          return JSON.parse(text.slice(start, index));
        } catch {
          syntaxError();
        }
      }
      if (character === "\\") {
        index += 1;
        if (index >= text.length) syntaxError();
        const escape = text[index];
        if ('"\\/bfnrt'.includes(escape)) {
          index += 1;
          continue;
        }
        if (escape !== "u") syntaxError();
        for (let offset = 1; offset <= 4; offset += 1) {
          if (!isHex(text[index + offset])) syntaxError();
        }
        index += 5;
        continue;
      }
      if (character.charCodeAt(0) < 0x20) {
        throw new Error("canonical_json_control_character");
      }
      index += 1;
    }

    throw new Error("canonical_json_unterminated_string");
  }

  function parseLiteral(literal) {
    if (text.slice(index, index + literal.length) !== literal) syntaxError();
    index += literal.length;
  }

  function parseNumber() {
    const match = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/.exec(text.slice(index));
    if (!match) syntaxError();
    index += match[0].length;
  }

  function parseArray() {
    index += 1;
    skipWhitespace();
    if (text[index] === "]") {
      index += 1;
      return;
    }

    while (true) {
      parseValue();
      skipWhitespace();
      if (text[index] === "]") {
        index += 1;
        return;
      }
      if (text[index] !== ",") syntaxError();
      index += 1;
      skipWhitespace();
      if (text[index] === "]") syntaxError();
    }
  }

  function parseObject() {
    index += 1;
    skipWhitespace();
    if (text[index] === "}") {
      index += 1;
      return;
    }

    const keys = new Set();
    while (true) {
      const key = parseString();
      if (keys.has(key)) throw new Error("canonical_json_duplicate_key");
      keys.add(key);
      skipWhitespace();
      if (text[index] !== ":") syntaxError();
      index += 1;
      parseValue();
      skipWhitespace();
      if (text[index] === "}") {
        index += 1;
        return;
      }
      if (text[index] !== ",") syntaxError();
      index += 1;
      skipWhitespace();
      if (text[index] === "}") syntaxError();
    }
  }

  function parseValue() {
    skipWhitespace();
    const character = text[index];
    if (character === "{") return parseObject();
    if (character === "[") return parseArray();
    if (character === '"') {
      parseString();
      return;
    }
    if (character === "t") return parseLiteral("true");
    if (character === "f") return parseLiteral("false");
    if (character === "n") return parseLiteral("null");
    if (character === "-" || (character >= "0" && character <= "9")) {
      parseNumber();
      return;
    }
    syntaxError();
  }

  skipWhitespace();
  parseValue();
  skipWhitespace();
  if (index !== text.length) syntaxError();
}
