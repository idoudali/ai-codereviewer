"use strict";
var __awaiter =
  (this && this.__awaiter) ||
  function (thisArg, _arguments, P, generator) {
    function adopt(value) {
      return value instanceof P
        ? value
        : new P(function (resolve) {
            resolve(value);
          });
    }
    return new (P || (P = Promise))(function (resolve, reject) {
      function fulfilled(value) {
        try {
          step(generator.next(value));
        } catch (e) {
          reject(e);
        }
      }
      function rejected(value) {
        try {
          step(generator["throw"](value));
        } catch (e) {
          reject(e);
        }
      }
      function step(result) {
        result.done
          ? resolve(result.value)
          : adopt(result.value).then(fulfilled, rejected);
      }
      step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
  };
Object.defineProperty(exports, "__esModule", { value: true });
exports.fakeOpenAI =
  exports.fakeOctokit =
  exports.openedEvent =
  exports.DIFF =
    void 0;
exports.DIFF = `diff --git a/src/app.ts b/src/app.ts
index 1111111..2222222 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -1,2 +1,3 @@
 const a = 1;
+const b = eval("2");
 export { a };
diff --git a/docs/notes.md b/docs/notes.md
index 3333333..4444444 100644
--- a/docs/notes.md
+++ b/docs/notes.md
@@ -1 +1,2 @@
 # Notes
+More notes.
`;
function openedEvent() {
  return {
    action: "opened",
    number: 7,
    repository: { name: "repo", owner: { login: "owner" } },
  };
}
exports.openedEvent = openedEvent;
/** A stand-in Octokit that records the review and comments it is asked to post. */
function fakeOctokit(diff = exports.DIFF) {
  const calls = {
    reviews: [],
    comments: [],
  };
  const octokit = {
    pulls: {
      get: (params) =>
        __awaiter(this, void 0, void 0, function* () {
          var _a;
          return ((_a = params.mediaType) === null || _a === void 0
            ? void 0
            : _a.format) === "diff"
            ? { data: diff }
            : { data: { title: "Add b", body: "Adds b." } };
        }),
      createReview: (params) =>
        __awaiter(this, void 0, void 0, function* () {
          calls.reviews.push(params);
        }),
    },
    repos: {
      compareCommits: () =>
        __awaiter(this, void 0, void 0, function* () {
          return { data: diff };
        }),
    },
    issues: {
      createComment: (params) =>
        __awaiter(this, void 0, void 0, function* () {
          calls.comments.push(params);
        }),
    },
  };
  return { octokit: octokit, calls };
}
exports.fakeOctokit = fakeOctokit;
/** A stand-in OpenAI client whose chat completion returns `content` or throws `error`. */
function fakeOpenAI(content, error) {
  const prompts = [];
  const openai = {
    chat: {
      completions: {
        create: (params) =>
          __awaiter(this, void 0, void 0, function* () {
            prompts.push(params);
            if (error) throw error;
            return { choices: [{ message: { content } }] };
          }),
      },
    },
  };
  return { openai: openai, prompts };
}
exports.fakeOpenAI = fakeOpenAI;
