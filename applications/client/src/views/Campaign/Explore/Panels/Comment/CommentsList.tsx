import { CarbonIcon, VirtualizedList, semanticIcons } from '@redeye/client/components';
import type { PresentationItemModel, SortTypeCommentsList } from '@redeye/client/store';
import {
	routes,
	presentationCommandGroupModelPrimitives,
	presentationItemModelPrimitives,
	useStore,
} from '@redeye/client/store';
import { CoreTokens, FlexSplitter, Txt } from '@redeye/ui-styles';
import { useQuery } from '@tanstack/react-query';
import { observer } from 'mobx-react-lite';
import { StarFilled16, Hashtag16, Playlist16, User16 } from '@carbon/icons-react';
import type { ComponentProps } from 'react';
import { useCallback, useMemo } from 'react';
import { CampaignViews, Tabs } from '@redeye/client/types';
import { InfoRow, RowTitle, IconLabel } from '../../components';

type CommentsListProps = ComponentProps<'div'> & {
	sort: SortTypeCommentsList;
};

// Fetch presentationData again when changing sort
export const CommentsList = observer<CommentsListProps>(({ sort }) => {
	const store = useStore();
	const { data } = useQuery(
		[
			'overview-comments-items',
			store.campaign.id,
			store.campaign.sortMemory.comments_list,
			store.campaign.sortMemory.comments,
		],
		async () =>
			await store.graphqlStore.queryPresentationItems(
				{
					campaignId: store.campaign.id!,
					hidden: store.settings.showHidden,
					forOverviewComments: true,
					listSort: sort,
				},
				presentationItemModelPrimitives.commandGroups(presentationCommandGroupModelPrimitives).toString(),
				undefined,
				true
			)
	);

	// For presentationItem.id by User or Tag, make sure use a prefix in case it's same to other general types.
	const handleClickType = useCallback((presentationItem) => {
		store.router.updateRoute({
			path: routes[CampaignViews.EXPLORE],
			params: {
				id: store.campaign.id,
				view: CampaignViews.EXPLORE,
				tab: Tabs.COMMENTS,
				currentItem: 'comments_list',
				currentItemId: presentationItem.id,
			},
		});
	}, []);

	const rowTitle = useMemo(
		() => (presentationItem: PresentationItemModel) =>
			presentationItem.key[0] === '#'
				? presentationItem.key.slice(1)
				: presentationItem.key.slice(0, 5) === 'user-'
				? presentationItem.key.slice(5)
				: presentationItem.key,
		[]
	);

	return (
		<VirtualizedList>
			{data?.presentationItems?.map((presentationItem, i) => (
				<InfoRow
					// eslint-disable-next-line react/no-array-index-key
					key={`${presentationItem.id}-${i}`}
					onClick={() => handleClickType(presentationItem)}
				>
					{presentationItem.id !== 'all' && (
						<CarbonIcon
							icon={getIcon(presentationItem.id)}
							css={presentationItem.id === 'procedural' && { color: `${CoreTokens.TextDisabled} !important` }}
						/>
					)}
					<RowTitle>
						<Txt
							bold={['all', 'favorited'].includes(presentationItem.id)}
							muted={presentationItem.id === 'procedural'}
							italic={presentationItem.id === 'procedural'}
							ellipsize
						>
							{rowTitle(presentationItem)}
						</Txt>
					</RowTitle>
					<FlexSplitter />
					<IconLabel
						cy-test="command-count"
						title="Commands"
						value={presentationItem.commandCount}
						icon={semanticIcons.commands}
					/>
					<IconLabel
						cy-test="comment-count"
						title="Comments"
						value={presentationItem.count}
						icon={semanticIcons.comment}
					/>
				</InfoRow>
			))}
		</VirtualizedList>
	);
});

const getIcon = (itemId: string): any => {
	if (itemId === 'favorited') return StarFilled16;
	if (itemId === 'procedural') return Playlist16;
	if (itemId.slice(0, 5) === 'user-') return User16;
	else return Hashtag16;
};
