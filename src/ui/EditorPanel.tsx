import { Minus, Plus, Search } from 'lucide-react'
import { useEffect, useState, type KeyboardEvent } from 'react'
import { addNote, deleteNote, nextEditedNoteId, sortNotes, updateNote, type GridDivision } from '../music/noteEditing'
import { midiToName, TRACK_RANGES } from '../music/theory'
import type { Composition, NoteEvent, Track } from '../music/types'
import { ArrangementOverview } from './ArrangementOverview'
import { PianoRoll } from './PianoRoll'

export type { GridDivision } from '../music/noteEditing'
type EditorView = 'piano-roll' | 'arrangement'
type EditableNoteField = 'startBeats' | 'durationBeats' | 'midi' | 'velocity'
type NoteDraft = Record<EditableNoteField, string>

interface EditorPanelProps {
  composition: Composition
  activeTrack: Track
  playheadSeconds: number
  onSeek: (seconds: number) => void
  onAuditionNote: (note: NoteEvent) => void
  onChangeTrack: (trackId: string, patch: Partial<Track>) => void
}

function draftFor(note: NoteEvent | undefined): NoteDraft {
  return {
    startBeats: note ? String(note.startBeats) : '',
    durationBeats: note ? String(note.durationBeats) : '',
    midi: note ? String(note.midi) : '',
    velocity: note ? String(Math.round(note.velocity * 100)) : '',
  }
}

export function EditorPanel({ composition, activeTrack, playheadSeconds, onSeek, onAuditionNote, onChangeTrack }: EditorPanelProps) {
  const [view, setView] = useState<EditorView>('piano-roll')
  const [gridDivision, setGridDivision] = useState<GridDivision>(1)
  const [zoom, setZoom] = useState(1)
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null)
  const selectedNote = activeTrack.notes.find((note) => note.id === selectedNoteId)
  const [draft, setDraft] = useState<NoteDraft>(() => draftFor(selectedNote))
  const tabs: EditorView[] = ['piano-roll', 'arrangement']
  const orderedNotes = sortNotes(activeTrack.notes)
  const selectedIndex = orderedNotes.findIndex((note) => note.id === selectedNoteId)

  useEffect(() => {
    setSelectedNoteId(null)
  }, [activeTrack.id])

  useEffect(() => {
    if (selectedNoteId && !activeTrack.notes.some((note) => note.id === selectedNoteId)) setSelectedNoteId(null)
  }, [activeTrack.notes, selectedNoteId])

  useEffect(() => {
    setDraft(draftFor(selectedNote))
  }, [selectedNote])

  const selectAdjacentTab = (current: EditorView, direction: number) => {
    const next = tabs[(tabs.indexOf(current) + direction + tabs.length) % tabs.length]
    setView(next)
    document.getElementById(`editor-tab-${next}`)?.focus()
  }

  const selectNote = (note: NoteEvent) => {
    setSelectedNoteId(note.id)
    onSeek(note.startBeats * 60 / composition.settings.tempo)
    onAuditionNote(note)
  }

  const selectAdjacentNote = (direction: number) => {
    if (!orderedNotes.length) return
    const nextIndex = selectedIndex < 0
      ? direction > 0 ? 0 : orderedNotes.length - 1
      : (selectedIndex + direction + orderedNotes.length) % orderedNotes.length
    selectNote(orderedNotes[nextIndex])
  }

  const addNewNote = () => {
    const range = TRACK_RANGES[activeTrack.role]
    const midi = selectedNote?.midi ?? (activeTrack.role === 'drums' ? 36 : Math.round((range[0] + range[1]) / 2))
    const noteId = nextEditedNoteId(activeTrack.notes)
    const startBeats = playheadSeconds * composition.settings.tempo / 60
    const changed = addNote(activeTrack, composition.totalBeats, gridDivision, { startBeats, durationBeats: gridDivision, midi, velocity: 0.75 })
    onChangeTrack(activeTrack.id, { notes: changed.notes })
    setSelectedNoteId(noteId)
  }

  const commitField = (field: EditableNoteField) => {
    if (!selectedNote) return
    const parsed = Number(draft[field])
    if (!Number.isFinite(parsed)) {
      setDraft(draftFor(selectedNote))
      return
    }
    const value = field === 'velocity' ? parsed / 100 : parsed
    const changed = updateNote(activeTrack, selectedNote.id, { [field]: value }, composition.totalBeats, gridDivision)
    if (changed !== activeTrack) onChangeTrack(activeTrack.id, { notes: changed.notes })
    else setDraft(draftFor(selectedNote))
  }

  const handleDraftKey = (event: KeyboardEvent<HTMLInputElement>, field: EditableNoteField) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      commitField(field)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      setDraft(draftFor(selectedNote))
    }
  }

  const removeSelectedNote = () => {
    if (!selectedNote) return
    const changed = deleteNote(activeTrack, selectedNote.id)
    onChangeTrack(activeTrack.id, { notes: changed.notes })
    setSelectedNoteId(null)
  }

  const audibleMidi = selectedNote ? selectedNote.midi + activeTrack.octave * 12 : null

  return (
    <section className="editor-panel panel">
      <div className="editor-toolbar">
        <div className="editor-tabs" role="tablist" aria-label="Composition editor">
          <button id="editor-tab-piano-roll" role="tab" aria-selected={view === 'piano-roll'} aria-controls="editor-content" tabIndex={view === 'piano-roll' ? 0 : -1} onClick={() => setView('piano-roll')} onKeyDown={(event) => { if (event.key === 'ArrowRight') selectAdjacentTab('piano-roll', 1); if (event.key === 'ArrowLeft') selectAdjacentTab('piano-roll', -1) }}>Piano roll</button>
          <button id="editor-tab-arrangement" role="tab" aria-selected={view === 'arrangement'} aria-controls="editor-content" tabIndex={view === 'arrangement' ? 0 : -1} onClick={() => setView('arrangement')} onKeyDown={(event) => { if (event.key === 'ArrowRight') selectAdjacentTab('arrangement', 1); if (event.key === 'ArrowLeft') selectAdjacentTab('arrangement', -1) }}>Arrangement</button>
        </div>
        <div className="editor-tools">
          <label className="grid-select"><span>Grid</span><select aria-label="Grid resolution" value={gridDivision} onChange={(event) => setGridDivision(Number(event.target.value) as GridDivision)}><option value="1">1/4</option><option value="0.5">1/8</option><option value="0.25">1/16</option></select></label>
          <button className="icon-button" aria-label="Zoom out" title="Zoom out" disabled={zoom <= 1} onClick={() => setZoom((current) => Math.max(1, current - 0.5))}><Minus size={16} /></button>
          <button className="zoom-readout" aria-label="Reset editor zoom" title="Reset zoom" onClick={() => setZoom(1)}><Search size={14} />{zoom.toFixed(1)}×</button>
          <button className="icon-button" aria-label="Zoom in" title="Zoom in" disabled={zoom >= 4} onClick={() => setZoom((current) => Math.min(4, current + 0.5))}><Plus size={16} /></button>
        </div>
      </div>
      <div id="editor-content" className="editor-viewport" role="tabpanel" aria-labelledby={`editor-tab-${view}`}>
        {view === 'piano-roll'
          ? <PianoRoll composition={composition} track={activeTrack} playheadSeconds={playheadSeconds} gridDivision={gridDivision} zoom={zoom} selectedNoteId={selectedNoteId} onSelectNote={selectNote} onClearSelection={() => setSelectedNoteId(null)} onSeek={onSeek} />
          : <ArrangementOverview composition={composition} playheadSeconds={playheadSeconds} zoom={zoom} onSeek={onSeek} />}
      </div>
      <div className="note-inspector" aria-label="Note inspector">
        <div className="note-navigation">
          <div><strong>{selectedNote ? `Selected ${selectedIndex + 1} of ${orderedNotes.length}` : 'No note selected'}</strong><span>{selectedNote && audibleMidi !== null ? `Base ${midiToName(selectedNote.midi)} · Sounds ${midiToName(audibleMidi)}` : `${activeTrack.notes.length} notes in ${activeTrack.name}`}</span></div>
          <button type="button" disabled={!orderedNotes.length} onClick={() => selectAdjacentNote(-1)}>Previous note</button>
          <button type="button" disabled={!orderedNotes.length} onClick={() => selectAdjacentNote(1)}>Next note</button>
          <button type="button" className="audition-note-button" disabled={!selectedNote} onClick={() => { if (selectedNote) onAuditionNote(selectedNote) }}>Audition selected note</button>
          <button type="button" className="add-note-button" onClick={addNewNote}>Add note</button>
        </div>
        <div className="note-fields">
          <label><span>Start beat</span><input type="number" inputMode="decimal" step={gridDivision} min="0" max={composition.totalBeats - gridDivision} disabled={!selectedNote} value={draft.startBeats} onChange={(event) => setDraft((current) => ({ ...current, startBeats: event.target.value }))} onBlur={() => commitField('startBeats')} onKeyDown={(event) => handleDraftKey(event, 'startBeats')} /></label>
          <label><span>Duration in beats</span><input type="number" inputMode="decimal" step={gridDivision} min={gridDivision} max={composition.totalBeats} disabled={!selectedNote} value={draft.durationBeats} onChange={(event) => setDraft((current) => ({ ...current, durationBeats: event.target.value }))} onBlur={() => commitField('durationBeats')} onKeyDown={(event) => handleDraftKey(event, 'durationBeats')} /></label>
          <label><span>MIDI pitch{selectedNote ? ` (${midiToName(selectedNote.midi)})` : ''}</span><input type="number" inputMode="numeric" step="1" min={TRACK_RANGES[activeTrack.role][0]} max={TRACK_RANGES[activeTrack.role][1]} disabled={!selectedNote} value={draft.midi} onChange={(event) => setDraft((current) => ({ ...current, midi: event.target.value }))} onBlur={() => commitField('midi')} onKeyDown={(event) => handleDraftKey(event, 'midi')} /></label>
          <label><span>Velocity percent</span><input type="number" inputMode="decimal" step="1" min="0" max="100" disabled={!selectedNote} value={draft.velocity} onChange={(event) => setDraft((current) => ({ ...current, velocity: event.target.value }))} onBlur={() => commitField('velocity')} onKeyDown={(event) => handleDraftKey(event, 'velocity')} /></label>
          <button type="button" className="delete-note-button" disabled={!selectedNote} onClick={removeSelectedNote}>Delete note</button>
        </div>
        <p>Manual edits use base MIDI pitches. Regeneration replaces edits on unlocked layers; lock a layer to preserve them.</p>
      </div>
      <p className="editor-caption">{view === 'piano-roll' ? `Showing ${activeTrack.name}. Select a note on the roll or use the keyboard-reachable note controls.` : 'All layers across the complete seamless loop.'}</p>
    </section>
  )
}
