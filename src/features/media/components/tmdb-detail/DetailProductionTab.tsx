import { Building2 } from 'lucide-react'
import { Badge } from '@/shared/components/ui/badge'
import type { TmdbMediaType } from '@/shared/types/tmdb'
import { DetailInfoGrid } from './DetailInfoGrid'
import type {
  DetailCompany,
  DetailCountry,
  DetailInfoField,
  DetailNetwork,
} from './types'

interface DetailProductionTabProps {
  tmdbType: TmdbMediaType
  movieInfoFields: DetailInfoField[]
  tvInfoFields: DetailInfoField[]
  productionCompanies: DetailCompany[]
  productionCountries: DetailCountry[]
  networks: DetailNetwork[]
}

export function DetailProductionTab({
  tmdbType,
  movieInfoFields,
  tvInfoFields,
  productionCompanies,
  productionCountries,
  networks,
}: DetailProductionTabProps) {
  return (
    <section className="space-y-6">
      <div className="flex items-center gap-2">
        <Building2 className="size-4 text-primary" />
        <h2 className="text-base sm:text-lg font-bold tracking-tight text-foreground">制作与发行信息</h2>
      </div>

      {(movieInfoFields.length > 0 || tvInfoFields.length > 0) && (
        <div className="space-y-3">
          <h3 className="text-sm sm:text-base font-semibold text-foreground/90">
            {tmdbType === 'movie' ? '电影发行信息' : '剧集发行信息'}
          </h3>
          <DetailInfoGrid
            fields={tmdbType === 'movie' ? movieInfoFields : tvInfoFields}
            className="sm:grid-cols-2 lg:grid-cols-3"
          />
        </div>
      )}

      {productionCompanies.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm sm:text-base font-semibold text-foreground/90">制作公司</h3>
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {productionCompanies.map(company => (
              <div
                key={company.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-border/40 bg-card/30 p-3 backdrop-blur-xs transition-colors hover:border-border/70 hover:bg-card/50 shadow-2xs"
              >
                <span className="font-semibold text-xs sm:text-sm text-foreground/95 truncate">
                  {company.name}
                </span>
                <Badge variant="outline" className="shrink-0 rounded-full text-[10px] px-2 py-0 border-border/50">
                  {company.origin_country || '未知'}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      {productionCountries.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm sm:text-base font-semibold text-foreground/90">制作国家/地区</h3>
          <div className="flex flex-wrap gap-2">
            {productionCountries.map(country => (
              <Badge
                key={country.iso_3166_1}
                variant="outline"
                className="rounded-full bg-card/60 text-foreground/90 border-border/50 px-3 py-1 text-xs font-medium shadow-2xs"
              >
                {country.name} ({country.iso_3166_1})
              </Badge>
            ))}
          </div>
        </div>
      )}

      {networks.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm sm:text-base font-semibold text-foreground/90">发行平台 / 播出网络</h3>
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {networks.map(network => (
              <div
                key={network.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-border/40 bg-card/30 p-3 backdrop-blur-xs transition-colors hover:border-border/70 hover:bg-card/50 shadow-2xs"
              >
                <span className="font-semibold text-xs sm:text-sm text-foreground/95 truncate">
                  {network.name}
                </span>
                <Badge variant="outline" className="shrink-0 rounded-full text-[10px] px-2 py-0 border-border/50">
                  {network.origin_country || '未知'}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      {movieInfoFields.length === 0 &&
        tvInfoFields.length === 0 &&
        productionCompanies.length === 0 &&
        productionCountries.length === 0 &&
        networks.length === 0 && (
          <p className="text-muted-foreground text-xs sm:text-sm">当前条目没有制作与发行数据</p>
        )}
    </section>
  )
}
