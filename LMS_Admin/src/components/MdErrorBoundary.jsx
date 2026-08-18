import { Component } from 'react';

/**
 * Guards the markdown renderer so an article can NEVER show blank: if rendering
 * throws for any reason, we fall back to the raw markdown text instead of an
 * empty (or crashed) view.
 */
export class MdErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) return this.props.fallback ?? null;
    return this.props.children;
  }
}
