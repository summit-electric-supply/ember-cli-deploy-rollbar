const { stat } = require('fs/promises');

async function exists(path) {
  try {
    await stat(path);
  } catch (_) {
    return false;
  }

  return true;
}

class MockUI {
  constructor() {
    this.verbose = true;
    this.messages = [];
  }

  write() {
    // no-op
  }

  writeLine(message) {
    this.messages.push(message);
  }
}

module.exports = {
  exists,
  MockUI,
};
