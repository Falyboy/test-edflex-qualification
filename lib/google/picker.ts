export interface DriveFile {
  id: string
  name: string
  mimeType: string
}

declare global {
  interface Window {
    gapi?: {
      load: (lib: string, cb: () => void) => void
      client?: { getToken: () => { access_token: string } | null }
    }
    google?: {
      picker: {
        PickerBuilder: new () => {
          addView: (view: unknown) => unknown
          setOAuthToken: (token: string) => unknown
          setDeveloperKey: (key: string) => unknown
          setCallback: (cb: (data: { action: string; docs?: Array<{ id: string; name: string; mimeType: string }> }) => void) => unknown
          build: () => { setVisible: (v: boolean) => void }
        }
        ViewId: { DOCS: string }
        Action: { PICKED: string }
      }
    }
  }
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return }
    const s = document.createElement('script')
    s.src = src
    s.onload = () => resolve()
    s.onerror = () => reject(new Error(`Failed to load ${src}`))
    document.head.appendChild(s)
  })
}

export async function openGoogleDrivePicker(
  accessToken: string,
  onFilePicked: (file: DriveFile) => void
): Promise<void> {
  await loadScript('https://apis.google.com/js/api.js')

  await new Promise<void>(resolve => window.gapi!.load('picker', resolve))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const picker = (new window.google!.picker.PickerBuilder() as any)
    .addView(window.google!.picker.ViewId.DOCS)
    .setOAuthToken(accessToken)
    .setCallback((data: { action: string; docs?: Array<{ id: string; name: string; mimeType: string }> }) => {
      if (data.action === window.google!.picker.Action.PICKED && data.docs?.[0]) {
        const doc = data.docs[0]
        onFilePicked({ id: doc.id, name: doc.name, mimeType: doc.mimeType })
      }
    })
    .build()

  picker.setVisible(true)
}
