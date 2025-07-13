import React, { useRef, useEffect } from 'react';

interface AppProps {
  rootRef: React.RefObject<HTMLDivElement | null>;
}

export const App: React.FC<AppProps> = ({ rootRef }) => {
  return (
    <div ref={rootRef} id="app-root">
      <div id="app-container" style={{ filter: 'blur(5px)' }}>
        <canvas
          width="100"
          height="100"
          style={{ position: 'absolute', top: 0, zIndex: -2 }}
        />
        <div className="vignette" style={{ zIndex: -2 }}></div>

        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            margin: '16px 32px',
          }}
        >
          <p style={{ display: 'inline', float: 'left', margin: 0 }}>
            <span className="highlight">SIMULO CREATOR</span>
          </p>

          <div style={{ float: 'right' }}>
            <button className="underlined">SETTINGS</button>
            <button id="sign-out-button" className="underlined">
              LOGOUT
            </button>
          </div>

          <div
            id="project-list"
            className="row wrap"
            style={{
              clear: 'both',
              paddingTop: '8px',
              width: '100%',
              gap: '8px 16px',
            }}
          />
        </div>

        <div
          id="editor-controls"
          style={{
            display: 'none',
            flexDirection: 'column',
            gap: '8px',
            position: 'absolute',
            top: '20%',
            right: '32px',
            width: '20%',
            float: 'right',
          }}
        >
          <p style={{ borderBottom: '4px solid #444' }}>
            <span className="highlight">COMMAND CENTER</span>
          </p>

          <textarea
            id="prompt-input"
            style={{ resize: 'none', width: '100%', height: '100px' }}
            placeholder="Describe something, or ask a question..."
          />

          <button id="prompt-submit" className="outlined blue">
            EXECUTE
          </button>

          <div id="prompt-message"></div>
        </div>
      </div>

      <div
        id="auth-overlay"
        className="full-cover row"
        style={{
          zIndex: 100,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
        }}
      >
        <div
          className="column"
          style={{
            aspectRatio: '1/1',
            width: '30%',
            alignItems: 'stretch',
            justifyContent: 'center',
            backgroundColor: 'rgba(0, 0, 0, 0.2)',
            padding: '6rem',
            position: 'relative',
          }}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="-1 -1 102 102"
            width="100%"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              stroke: 'white',
              fill: 'transparent',
              strokeWidth: 1,
              pointerEvents: 'none',
            }}
          >
            <path
              d="M10 0 L100 0 L100 90 L90 100 L0 100 L0 10 Z"
              vectorEffect="non-scaling-stroke"
            />
          </svg>

          <form className="column" style={{ gap: '16px' }}>
            <h1 style={{ color: 'var(--primary-color)' }}>SIMULO CREATOR</h1>

            <label style={{ display: 'block', color: 'var(--primary-color)' }}>
              EMAIL
              <input
                type="email"
                id="email-input"
                className="outlined"
                placeholder="email@example.com"
                required
              />
            </label>

            <button type="submit" id="login-submit" className="outlined blue">
              SEND ACCESS LINK
            </button>

            <div id="message-container" style={{ minHeight: '3rem' }}></div>
          </form>
        </div>
      </div>
    </div>
  );
};