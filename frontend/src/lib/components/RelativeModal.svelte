<script lang="ts">
	import { type PersonDto, personApi, personLabel } from '$lib/api';
	import { i18n } from '$lib/i18n/index.svelte';

	let {
		anchorPerson = null,
		initialLinkType = 'CHILD',
		onClose,
		onCreated
	}: {
		anchorPerson?: PersonDto | null;
		initialLinkType?: 'FATHER' | 'MOTHER' | 'SPOUSE' | 'CHILD';
		onClose: () => void;
		onCreated: (created: PersonDto) => void;
	} = $props();

	let linkType = $state<'FATHER' | 'MOTHER' | 'SPOUSE' | 'CHILD'>('CHILD');
	let givenNames = $state('');
	let usageSurname = $state('');
	let gender = $state<'MALE' | 'FEMALE' | 'OTHER' | 'UNKNOWN'>('UNKNOWN');
	let birthDate = $state('');
	let birthPlace = $state('');
	let saving = $state(false);
	let error = $state('');

	$effect(() => {
		linkType = initialLinkType;
		if (initialLinkType === 'FATHER') gender = 'MALE';
		else if (initialLinkType === 'MOTHER') gender = 'FEMALE';
	});

	async function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		if (!givenNames.trim()) return;
		saving = true;
		error = '';
		try {
			if (anchorPerson) {
				const res = await personApi.createRelative(anchorPerson.id, linkType, {
					givenNames: givenNames.trim(),
					usageSurname: usageSurname.trim() || null,
					gender,
					birthDate: birthDate.trim() || null,
					birthPlace: birthPlace.trim() || null
				});
				onCreated(res.createdPerson);
			} else {
				const created = await personApi.create({
					givenNames: givenNames.trim(),
					usageSurname: usageSurname.trim() || null,
					gender,
					birthDate: birthDate.trim() || null,
					birthPlace: birthPlace.trim() || null,
					isRootDefault: true
				});
				onCreated(created);
			}
			onClose();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Error';
		} finally {
			saving = false;
		}
	}
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="modal-backdrop" onclick={onClose}>
	<div class="modal-card" style="max-width: 500px;" onclick={(e) => e.stopPropagation()}>
		<div class="modal-header">
			<h3 style="margin: 0; font-size: 1.02rem; font-weight: 800;">
				{#if anchorPerson}
					＋ {i18n.t('addRelativeBtn')} — {personLabel(anchorPerson)}
				{:else}
					🌱 {i18n.t('createRootPersonBtn')}
				{/if}
			</h3>
			<button type="button" class="btn btn-ghost btn-sm" onclick={onClose}>✕</button>
		</div>

		<form onsubmit={handleSubmit} class="modal-body" style="display: flex; flex-direction: column; gap: 0.85rem;">
			{#if error}
				<div style="padding: 0.65rem; border-radius: var(--radius-md); background: rgba(239,68,68,0.14); color: var(--danger); font-size: 0.83rem;">
					{error}
				</div>
			{/if}

			{#if anchorPerson}
				<div>
					<label class="label" for="rel-type">Lien avec {personLabel(anchorPerson)}</label>
					<select
						id="rel-type"
						class="select"
						bind:value={linkType}
						onchange={() => {
							if (linkType === 'FATHER') gender = 'MALE';
							else if (linkType === 'MOTHER') gender = 'FEMALE';
						}}
					>
						<option value="FATHER">{i18n.t('rel_FATHER')}</option>
						<option value="MOTHER">{i18n.t('rel_MOTHER')}</option>
						<option value="SPOUSE">{i18n.t('rel_SPOUSE')}</option>
						<option value="CHILD">{i18n.t('rel_CHILD')}</option>
					</select>
				</div>
			{/if}

			<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.7rem;">
				<div>
					<label class="label" for="rel-given">{i18n.t('givenNames')} *</label>
					<input id="rel-given" class="input" bind:value={givenNames} required />
				</div>
				<div>
					<label class="label" for="rel-surname">{i18n.t('usageSurname')}</label>
					<input id="rel-surname" class="input" bind:value={usageSurname} />
				</div>
			</div>

			<div>
				<label class="label" for="rel-gender">{i18n.t('gender')}</label>
				<select id="rel-gender" class="select" bind:value={gender}>
					<option value="MALE">{i18n.t('gender_MALE')}</option>
					<option value="FEMALE">{i18n.t('gender_FEMALE')}</option>
					<option value="OTHER">{i18n.t('gender_OTHER')}</option>
					<option value="UNKNOWN">{i18n.t('gender_UNKNOWN')}</option>
				</select>
			</div>

			<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.7rem;">
				<div>
					<label class="label" for="rel-bdate">{i18n.t('birthDate')}</label>
					<input id="rel-bdate" type="date" class="input" bind:value={birthDate} />
				</div>
				<div>
					<label class="label" for="rel-bplace">{i18n.t('birthPlace')}</label>
					<input id="rel-bplace" class="input" bind:value={birthPlace} />
				</div>
			</div>

			<div style="display: flex; justify-content: flex-end; gap: 0.5rem; padding-top: 0.5rem;">
				<button type="button" class="btn btn-secondary" onclick={onClose}>
					{i18n.t('cancelBtn')}
				</button>
				<button type="submit" class="btn btn-primary" disabled={saving}>
					{i18n.t('saveBtn')}
				</button>
			</div>
		</form>
	</div>
</div>
