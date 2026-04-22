const fs = require('fs');
let f = fs.readFileSync('src/app/page.tsx', 'utf8');

const startControls = f.indexOf('        {/* ─── Controls Bar ──────────────────── */}');
const endControls = f.indexOf('        {/* ─── Tree Canvas ───────────────────── */}');
const startSide = f.indexOf('      {/* ─── Interactive Side Panel ────────────────── */}');
const endSide = f.indexOf('// ─── Wrapper with Provider ──────────────────');

if (startControls === -1 || endControls === -1 || startSide === -1 || endSide === -1) {
  console.log('Failed to find boundaries');
  process.exit(1);
}

const leftPanel = `        {/* ─── Left Settings Panel ──────────────────── */}
        <TreeSettingsPanel
          visible={controlsVisible}
          onClose={() => setControlsVisible(false)}
          ancestorGens={ancestorGens}
          descendantGens={descendantGens}
          onAncestorGensChange={setAncestorGens}
          onDescendantGensChange={setDescendantGens}
          focusModeEnabled={focusModeEnabled}
          onFocusModeChange={setFocusModeEnabled}
          dragLinkType={dragLinkType}
          onDragLinkTypeChange={(v) => setDragLinkType(v as DragLinkType)}
          relationshipType={relationshipType}
          onRelationshipTypeChange={setRelationshipType}
          unionType={unionType}
          onUnionTypeChange={setUnionType}
          onZoomIn={quickZoomIn}
          onZoomOut={quickZoomOut}
          onZoomFit={zoomToGlobalView}
          onFocusSelected={focusOnSelected}
          onChangeRoot={(p) => { setRootPersonId(p.id); setSelectedPersonId(p.id); }}
          selectedPersonId={selectedPersonId}
          isAdmin={isAdmin}
          nodeCount={nodeCount}
          onSetDefaultRoot={setCurrentAsDefaultRoot}
          onOpenStandaloneCreate={openStandaloneCreate}
          actionBusy={actionBusy}
          onExportPng={exportVisibleAsPng}
          onExportPdf={exportVisibleAsPdf}
          onExportCsvVisible={exportVisibleTableCsv}
          onExportCsvBranch={exportSelectedBranchCsv}
          exportBusy={exportBusy}
          canUndo={canUndo}
          canRedo={canRedo}
          onUndo={undoLastAction}
          onRedo={redoLastAction}
          presentationMode={presentationMode}
          onTogglePresentation={() => setPresentationMode(!presentationMode)}
          error={error}
          onRetry={loadTree}
        />

        {!presentationMode && !controlsVisible && (
          <button
            className="btn btn-primary"
            style={{
              position: 'absolute',
              top: 'var(--space-3)',
              left: 'var(--space-3)',
              zIndex: 16,
            }}
            onClick={() => setControlsVisible(true)}
          >
            🌳 Menu
          </button>
        )}

`;

const rightPanel = `      {/* ─── Interactive Side Panel ────────────────── */}
      {showSelectionPanel && selectedPerson && (
        <TreePersonPanel
          person={selectedPerson}
          personId={selectedPersonId}
          isAdmin={isAdmin}
          onClose={() => setSelectedPersonId(null)}
          onCenterOnPerson={focusOnSelected}
          onPersonUpdated={loadTree}
          token={token}
        />
      )}
    </div>
  );
}

`;

f = f.slice(0, startControls) + leftPanel + f.slice(endControls, startSide) + rightPanel + f.slice(endSide);
fs.writeFileSync('src/app/page.tsx', f);
console.log('Successfully replaced panels.');
