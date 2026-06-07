// globals-shim.js — the vendored design files (from Claude Design) use the
// classic global pattern: `const { useState } = React;` and components assigned
// to / read from `window`. Expose React + ReactDOM globally before they load.
import * as React from "react";
import * as ReactDOM from "react-dom/client";

window.React = React;
window.ReactDOM = ReactDOM;
