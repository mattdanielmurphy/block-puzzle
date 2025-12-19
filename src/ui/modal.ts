export interface ModalOptions {
	onClose?: () => void
	onShow?: () => void
	closeOnOutsideClick?: boolean
	closeOnEsc?: boolean
}

export class Modal {
	private static openModals: Modal[] = []
	private static isGlobalHandlerAttached = false

	private element: HTMLElement
	private options: Required<ModalOptions>

	constructor(elementId: string, options: ModalOptions = {}) {
		const el = document.getElementById(elementId)
		if (!el) {
			throw new Error(`Modal element with id "${elementId}" not found`)
		}
		this.element = el

		this.options = {
			onClose: options.onClose || (() => {}),
			onShow: options.onShow || (() => {}),
			closeOnOutsideClick: options.closeOnOutsideClick !== undefined ? options.closeOnOutsideClick : true,
			closeOnEsc: options.closeOnEsc !== undefined ? options.closeOnEsc : true,
		}

		if (this.options.closeOnOutsideClick) {
			this.element.addEventListener("click", (e) => {
				if (e.target === this.element) {
					this.hide()
				}
			})
		}

		if (!Modal.isGlobalHandlerAttached) {
			document.addEventListener("keydown", Modal.handleGlobalEsc, true) // Use capture to be first
			Modal.isGlobalHandlerAttached = true
		}
	}

	public show() {
		if (!this.element.classList.contains("hidden")) return

		this.element.classList.remove("hidden")
		Modal.openModals.push(this)
		this.options.onShow()
	}

	public hide() {
		if (this.element.classList.contains("hidden")) return

		this.element.classList.add("hidden")
		const index = Modal.openModals.indexOf(this)
		if (index !== -1) {
			Modal.openModals.splice(index, 1)
		}
		this.options.onClose()
	}

	public isVisible(): boolean {
		return !this.element.classList.contains("hidden")
	}

	private static handleGlobalEsc(e: KeyboardEvent) {
		if (e.key === "Escape") {
			if (Modal.openModals.length === 0) return

			// Check if we are in an input field
			const activeElement = document.activeElement
			if (activeElement && activeElement.tagName.toLowerCase() === "input") {
				return
			}

			const topModal = Modal.openModals[Modal.openModals.length - 1]
			if (topModal.options.closeOnEsc) {
				e.preventDefault()
				e.stopImmediatePropagation()
				topModal.hide()
			}
		}
	}
}
