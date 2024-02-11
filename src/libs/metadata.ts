import { MetadataEntryBuilder, MetadataValueBuilder, ScopedMetadataKeyDto } from "catbuffer-typescript";
import { Observable } from "rxjs";
import { MetadataInfoDTO, MetadataRoutesApi, Pagination } from "symbol-openapi-typescript-fetch-client";
import {
    Address,
    Convert,
    DtoMapping,
    Http,
    MerkleStateInfo,
    Metadata,
    MetadataSearchCriteria,
    MetadataType,
    MosaicId,
    NamespaceId,
    NetworkType,
    Page,
    PaginationStreamer,
    Searcher,
    SearcherRepository,
    UInt64
} from "symbol-sdk";


/**
 * A mosaic describes an instance of a mosaic definition.
 * Mosaics can be transferred by means of a transfer transaction.
 */
export class BinMetadataEntry {
    /**
     * Constructor
     * @param {number} version - The version
     * @param {string} compositeHash - The composite hash
     * @param {string} sourceAddress - The metadata source address (provider)
     * @param {string} targetAddress - The metadata target address
     * @param {UInt64} scopedMetadataKey - The key scoped to source, target and type
     * @param {MetadatType} metadataType - The metadata type (Account | Mosaic | Namespace)
     * @param {Uint8Array} value - The metadata value
     * @param {UnresolvedMosaicId | undefined} targetId - The target mosaic or namespace identifier
     */
    constructor(
        /**
         * Version
         */
        public readonly version: number,
        /**
         * The composite hash
         */
        public readonly compositeHash: string,
        /**
         * The metadata source address (provider)
         */
        public readonly sourceAddress: Address,
        /**
         * The metadata target address
         */
        public readonly targetAddress: Address,
        /**
         * The key scoped to source, target and type
         */
        public readonly scopedMetadataKey: UInt64,
        /**
         * The metadata type
         */
        public readonly metadataType: MetadataType,
        /**
         * The metadata value
         */
        public readonly value: Uint8Array,
        /**
         * The target mosaic or namespace identifier
         */
        public readonly targetId?: MosaicId | NamespaceId,
    ) {}

    /**
     * Generate buffer
     * @return {Uint8Array}
     */
    public serialize(): Uint8Array {
        const sourceAddress = this.sourceAddress.toBuilder();
        const targetAddress = this.targetAddress.toBuilder();

        /** Metadata key scoped to source, target and type. */
        const scopedMetadataKey = new ScopedMetadataKeyDto(this.scopedMetadataKey.toDTO());
        /** Target id. */
        const targetId: number[] = this.targetId?.id.toDTO() || [0, 0];
        /** Metadata type. */
        const metadataType = this.metadataType.valueOf();
        /** Value. */
        const value = new MetadataValueBuilder(this.value);

        return new MetadataEntryBuilder(
            this.version,
            sourceAddress,
            targetAddress,
            scopedMetadataKey,
            targetId,
            metadataType,
            value,
        ).serialize();
    }
}

/**
 * A mosaic describes an instance of a mosaic definition.
 * Mosaics can be transferred by means of a transfer transaction.
 */
export class BinMetadata {
    /**
     * Constructor
     * @param id - The metadata id
     * @param metadataEntry - The metadata entry
     */
    constructor(
        /**
         * The metadata id
         */
        public readonly id: string,
        /**
         * The metadata entry
         */
        public readonly metadataEntry: BinMetadataEntry,
    ) {}
}

/**
 * A helper object that streams {@link Metadata} using the search.
 */
export class BinMetadataPaginationStreamer extends PaginationStreamer<BinMetadata, MetadataSearchCriteria> {
    /**
     * Constructor
     *
     * @param searcher the metadata repository that will perform the searches
     */
    constructor(searcher: Searcher<BinMetadata, MetadataSearchCriteria>) {
        super(searcher);
    }
}

/**
 * Metadata interface repository.
 *
 * @since 1.0
 */
export interface BinMetadataRepository extends SearcherRepository<BinMetadata, MetadataSearchCriteria> {
    /**
     * Get metadata of the given id.
     * @param compositeHash Metadata composite hash id
     * @returns Observable<BinMetadata>
     */
    getMetadata(compositeHash: string): Observable<BinMetadata>;

    /**
     * Get metadata merkle of the given id.
     * @param compositeHash Metadata composite hash id
     * @returns Observable<MerkleStateInfo>
     */
    getMetadataMerkle(compositeHash: string): Observable<MerkleStateInfo>;
}

/**
 * Metadata http repository.
 *
 * @since 1.0
 */
export class BinMetadataHttp extends Http implements BinMetadataRepository {
    /**
     * @internal
     * Symbol openapi typescript-node client metadata routes api
     */
    private readonly metadataRoutesApi: MetadataRoutesApi;

    /**
     * Constructor
     * @param url Base catapult-rest url
     * @param fetchApi fetch function to be used when performing rest requests.
     */
    constructor(url: string, fetchApi?: any) {
        super(url, fetchApi);
        this.metadataRoutesApi = new MetadataRoutesApi(this.config());
    }

    /**
     * Gets an array of metadata.
     * @param criteria - Metadata search criteria
     * @returns Observable<Page<BinMetadata>>
     */
    public search(criteria: MetadataSearchCriteria): Observable<Page<BinMetadata>> {
        return this.call(
            this.metadataRoutesApi.searchMetadataEntries(
                criteria.sourceAddress?.plain(),
                criteria.targetAddress?.plain(),
                criteria.scopedMetadataKey,
                criteria.targetId?.toHex(),
                criteria.metadataType?.valueOf(),
                criteria.pageSize,
                criteria.pageNumber,
                criteria.offset,
                DtoMapping.mapEnum(criteria.order),
            ),
            (body) => this.toPage(body.pagination, body.data, this.toMetadata),
        );
    }

    /**
     * Get metadata of the given id.
     * @param compositeHash Metadata composite hash id
     * @returns Observable<BinMetadata>
     */
    public getMetadata(compositeHash: string): Observable<BinMetadata> {
        return this.call(this.metadataRoutesApi.getMetadata(compositeHash), (body) => this.toMetadata(body));
    }

    /**
     * Get metadata merkle of the given id.
     * @param compositeHash Metadata composite hash id
     * @returns Observable<MerkleStateInfo>
     */
    public getMetadataMerkle(compositeHash: string): Observable<MerkleStateInfo> {
        return this.call(this.metadataRoutesApi.getMetadataMerkle(compositeHash), DtoMapping.toMerkleStateInfo);
    }

    public streamer(): BinMetadataPaginationStreamer {
        return new BinMetadataPaginationStreamer(this);
    }

    /**
     * It maps MetadataDTO into a Metadata
     * @param metadata - the dto
     * @returns the model MetalV2Metadata.
     */
    private toMetadata(metadata: MetadataInfoDTO): BinMetadata {
        const metadataEntry = metadata.metadataEntry;
        let targetId;

        switch (metadataEntry.metadataType.valueOf()) {
            case MetadataType.Mosaic:
                targetId = new MosaicId(metadataEntry.targetId as any);
                break;
            case MetadataType.Namespace:
                targetId = NamespaceId.createFromEncoded(metadataEntry.targetId as any);
                break;
            default:
                targetId = undefined;
        }
        return new BinMetadata(
            metadata.id,
            new BinMetadataEntry(
                metadataEntry.version || 1,
                metadataEntry.compositeHash,
                DtoMapping.toAddress(metadataEntry.sourceAddress),
                DtoMapping.toAddress(metadataEntry.targetAddress),
                UInt64.fromHex(metadataEntry.scopedMetadataKey),
                metadataEntry.metadataType.valueOf(),
                // DO NOT convert hex into string.
                Convert.hexToUint8(metadataEntry.value),
                targetId,
            ),
        );
    }

    /**
     * This method maps a rest page object from rest to the SDK's Page model object.
     *
     * @internal
     * @param pagination rest pagination object.
     * @param data rest pagination data object.
     * @param mapper the mapper from dto to the model object.
     * @param networkType the network type.
     * @returns Page<T> model
     */
    protected toPage<D, M>(
        pagination: Pagination,
        data: D[],
        mapper: (value: D, networkType?: NetworkType) => M,
        networkType?: NetworkType,
    ): Page<M> {
        return new Page<M>(
            data.map((d) => mapper(d, networkType)),
            pagination?.pageNumber,
            pagination?.pageSize,
        );
    }
}
